using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace WinUI.Diagnostics
{
    // A PID-filtered, user-mode ETW logger. No kernel logger or permission changes.
    public sealed class PrivateEtwSession : IDisposable
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct WnodeHeader
        {
            public uint BufferSize, ProviderId;
            public ulong HistoricalContext, TimeStamp;
            public Guid Guid;
            public uint ClientContext, Flags;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct TraceProperties
        {
            public WnodeHeader Wnode;
            public uint BufferSize, MinimumBuffers, MaximumBuffers, MaximumFileSize;
            public uint LogFileMode, FlushTimer, EnableFlags;
            public int AgeLimit;
            public uint NumberOfBuffers, FreeBuffers, EventsLost, BuffersWritten;
            public uint LogBuffersLost, RealTimeBuffersLost;
            public IntPtr LoggerThreadId;
            public uint LogFileNameOffset, LoggerNameOffset, VersionNumber, FilterDescCount;
            public IntPtr FilterDesc;
            public ulong V2Options;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct EventFilter
        {
            public ulong Ptr;
            public uint Size, Type;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct EnableParameters
        {
            public uint Version, EnableProperty, ControlFlags;
            public Guid SourceId;
            public IntPtr EnableFilterDesc;
            public uint FilterDescCount;
        }

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern uint StartTraceW(out ulong handle, string name, IntPtr properties);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern uint ControlTraceW(ulong handle, string name, IntPtr properties, uint code);

        [DllImport("advapi32.dll", ExactSpelling = true)]
        private static extern uint EnableTraceEx2(ulong handle, ref Guid provider, uint code,
            byte level, ulong anyKeyword, ulong allKeywords, uint timeout,
            ref EnableParameters parameters);

        private const uint WnodeFlags = 0x00020000 | 0x00800000; // Traced GUID + versioned properties.
        private const uint PrivateFileMode = 0x00000800 | 0x00000001;
        private const uint PidFilter = 0x80000004;
        private const int StringBytes = 2048;
        private readonly string name;
        private IntPtr properties, filter, processId;
        private ulong handle;
        private bool disposed;

        public uint? EventsLost { get; private set; }
        public uint? LogBuffersLost { get; private set; }
        public bool StopSucceeded { get; private set; }
        public bool SessionAlreadyStopped { get; private set; }
        public string Name { get { return name; } }

        public PrivateEtwSession(int targetProcessId, string outputPath, uint maximumFileSizeMB)
        {
            if (targetProcessId <= 0)
                throw new ArgumentOutOfRangeException("targetProcessId");
            if (String.IsNullOrWhiteSpace(outputPath) || outputPath.Length > 990)
                throw new ArgumentException("Use an absolute ETL path of at most 990 characters.", "outputPath");
            if (!System.IO.Path.IsPathRooted(outputPath))
                throw new ArgumentException("The ETL path must be absolute.", "outputPath");
            if (maximumFileSizeMB == 0)
                throw new ArgumentOutOfRangeException("maximumFileSizeMB");

            name = "WinUIPrivateTrace-" + targetProcessId;
            try
            {
                int size = Marshal.SizeOf(typeof(TraceProperties));
                int totalSize = size + 2 * StringBytes;
                properties = Marshal.AllocHGlobal(totalSize);
                Marshal.Copy(new byte[totalSize], 0, properties, totalSize);
                processId = Marshal.AllocHGlobal(sizeof(int));
                Marshal.WriteInt32(processId, targetProcessId);
                filter = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(EventFilter)));
                Marshal.StructureToPtr(new EventFilter {
                    Ptr = unchecked((ulong)processId.ToInt64()), Size = sizeof(int), Type = PidFilter
                }, filter, false);

                var settings = new TraceProperties {
                    Wnode = new WnodeHeader {
                        BufferSize = (uint)totalSize, ClientContext = 1, Flags = WnodeFlags,
                        Guid = Guid.NewGuid()
                    },
                    BufferSize = 64, MinimumBuffers = 4, MaximumBuffers = 16,
                    MaximumFileSize = maximumFileSizeMB, LogFileMode = PrivateFileMode,
                    FlushTimer = 1,
                    LoggerNameOffset = (uint)size, LogFileNameOffset = (uint)(size + StringBytes),
                    VersionNumber = 2, FilterDescCount = 1, FilterDesc = filter
                };
                Marshal.StructureToPtr(settings, properties, false);
                byte[] path = System.Text.Encoding.Unicode.GetBytes(outputPath + "\0");
                Marshal.Copy(path, 0, IntPtr.Add(properties, size + StringBytes), path.Length);

                ulong startedHandle;
                uint status = StartTraceW(out startedHandle, name, properties);
                ThrowIfFailed(status, "StartTrace");
                handle = startedHandle;
            }
            catch
            {
                FreeMemory();
                throw;
            }
        }

        public void Enable(Guid provider, ulong keywords)
        {
            if (disposed || handle == 0)
                throw new ObjectDisposedException("PrivateEtwSession");
            var parameters = new EnableParameters {
                Version = 2, EnableFilterDesc = filter, FilterDescCount = 1
            };
            // Keep the PID filter on both the session and each enable operation.
            ThrowIfFailed(EnableTraceEx2(handle, ref provider, 1, 5, keywords, 0, 5000,
                ref parameters), "EnableTraceEx2(" + provider + ")");
        }

        public void Stop()
        {
            if (disposed)
                throw new ObjectDisposedException("PrivateEtwSession");
            if (handle == 0)
                return;
            // Retain the versioned properties and PID filter for ControlTrace too.
            uint status = ControlTraceW(handle, name, properties, 1);
            // Sequential logs stop automatically at their size limit. No final
            // counters are available if ETW has already removed the session.
            if (status == 4201) // ERROR_WMI_INSTANCE_NOT_FOUND
            {
                handle = 0;
                SessionAlreadyStopped = true;
                return;
            }
            ThrowIfFailed(status, "ControlTrace(STOP)");
            handle = 0;
            StopSucceeded = true;
            var result = (TraceProperties)Marshal.PtrToStructure(properties, typeof(TraceProperties));
            EventsLost = result.EventsLost;
            LogBuffersLost = result.LogBuffersLost;
        }

        private static void ThrowIfFailed(uint status, string operation)
        {
            if (status != 0)
                throw new Win32Exception((int)status, operation + " failed (" + status + "): " +
                    new Win32Exception((int)status).Message);
        }

        private void FreeMemory()
        {
            if (properties != IntPtr.Zero) { Marshal.FreeHGlobal(properties); properties = IntPtr.Zero; }
            if (filter != IntPtr.Zero) { Marshal.FreeHGlobal(filter); filter = IntPtr.Zero; }
            if (processId != IntPtr.Zero) { Marshal.FreeHGlobal(processId); processId = IntPtr.Zero; }
        }

        public void Dispose()
        {
            if (disposed)
                return;
            try { Stop(); }
            finally { FreeMemory(); disposed = true; }
        }
    }
}
