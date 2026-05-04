// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Collections.Generic;

internal record PackageWithWinMd(string Id, string Version, List<string> WinMdFiles, List<string> XmlDocFiles);
