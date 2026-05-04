// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;

internal static class WinMdParser
{
	public static List<WinMdTypeInfo> ParseFile(string filePath)
	{
		List<WinMdTypeInfo> list = new List<WinMdTypeInfo>();
		try
		{
			using FileStream peStream = File.OpenRead(filePath);
			using PEReader pEReader = new PEReader(peStream);
			if (!pEReader.HasMetadata)
			{
				return list;
			}
			MetadataReader metadataReader = pEReader.GetMetadataReader();
			SimpleTypeProvider typeProvider = new SimpleTypeProvider();
			foreach (TypeDefinitionHandle typeDefinition2 in metadataReader.TypeDefinitions)
			{
				TypeDefinition typeDefinition = metadataReader.GetTypeDefinition(typeDefinition2);
				string text = metadataReader.GetString(typeDefinition.Name);
				string text2 = metadataReader.GetString(typeDefinition.Namespace);
				if (!ShouldSkipType(text, typeDefinition))
				{
					TypeKind typeKind = DetermineTypeKind(metadataReader, typeDefinition);
					string baseTypeName = GetBaseTypeName(metadataReader, typeDefinition);
					List<WinMdMemberInfo> members = ParseMembers(metadataReader, typeDefinition, typeProvider);
					List<string> enumValues = ((typeKind == TypeKind.Enum) ? ParseEnumValues(metadataReader, typeDefinition) : null);
					string fullName = (string.IsNullOrEmpty(text2) ? text : (text2 + "." + text));
					string? deprecatedMessage = GetDeprecatedMessage(metadataReader, typeDefinition.GetCustomAttributes());
					// Apply deprecated messages to members
					ApplyMemberDeprecation(metadataReader, typeDefinition, members);
					list.Add(new WinMdTypeInfo
					{
						Namespace = text2,
						Name = text,
						FullName = fullName,
						Kind = typeKind,
						BaseType = baseTypeName,
						Members = members,
						EnumValues = enumValues,
						SourceFile = Path.GetFileName(filePath),
						DeprecatedMessage = deprecatedMessage
					});
				}
			}
		}
		catch (Exception ex)
		{
			Console.Error.WriteLine("Warning: Failed to parse " + filePath + ": " + ex.Message);
		}
		return list;
	}

	internal static bool ShouldSkipType(string name, TypeDefinition typeDef)
	{
		if (string.IsNullOrEmpty(name) || name == "<Module>" || name.StartsWith('<'))
		{
			return true;
		}
		TypeAttributes typeAttributes = typeDef.Attributes & TypeAttributes.VisibilityMask;
		if (typeAttributes != TypeAttributes.Public)
		{
			return typeAttributes != TypeAttributes.NestedPublic;
		}
		return false;
	}

	internal static TypeKind DetermineTypeKind(MetadataReader reader, TypeDefinition typeDef)
	{
		if ((typeDef.Attributes & TypeAttributes.ClassSemanticsMask) != TypeAttributes.NotPublic)
		{
			return TypeKind.Interface;
		}
		switch (GetBaseTypeName(reader, typeDef))
		{
		case "System.Enum":
			return TypeKind.Enum;
		case "System.ValueType":
			return TypeKind.Struct;
		case "System.MulticastDelegate":
		case "System.Delegate":
			return TypeKind.Delegate;
		default:
			return TypeKind.Class;
		}
	}

	private static string? GetBaseTypeName(MetadataReader reader, TypeDefinition typeDef)
	{
		if (typeDef.BaseType.IsNil)
		{
			return null;
		}
		return typeDef.BaseType.Kind switch
		{
			HandleKind.TypeDefinition => GetTypeDefName(reader, (TypeDefinitionHandle)typeDef.BaseType), 
			HandleKind.TypeReference => GetTypeRefName(reader, (TypeReferenceHandle)typeDef.BaseType), 
			_ => null, 
		};
	}

	private static string GetTypeDefName(MetadataReader reader, TypeDefinitionHandle handle)
	{
		TypeDefinition typeDefinition = reader.GetTypeDefinition(handle);
		string text = reader.GetString(typeDefinition.Namespace);
		string text2 = reader.GetString(typeDefinition.Name);
		if (!string.IsNullOrEmpty(text))
		{
			return text + "." + text2;
		}
		return text2;
	}

	private static string GetTypeRefName(MetadataReader reader, TypeReferenceHandle handle)
	{
		TypeReference typeReference = reader.GetTypeReference(handle);
		string text = reader.GetString(typeReference.Namespace);
		string text2 = reader.GetString(typeReference.Name);
		if (!string.IsNullOrEmpty(text))
		{
			return text + "." + text2;
		}
		return text2;
	}

	private static List<WinMdMemberInfo> ParseMembers(MetadataReader reader, TypeDefinition typeDef, SimpleTypeProvider typeProvider)
	{
		List<WinMdMemberInfo> list = new List<WinMdMemberInfo>();
		HashSet<MethodDefinitionHandle> hashSet = new HashSet<MethodDefinitionHandle>();
		foreach (PropertyDefinitionHandle property in typeDef.GetProperties())
		{
			PropertyAccessors accessors = reader.GetPropertyDefinition(property).GetAccessors();
			if (!accessors.Getter.IsNil)
			{
				hashSet.Add(accessors.Getter);
			}
			if (!accessors.Setter.IsNil)
			{
				hashSet.Add(accessors.Setter);
			}
		}
		foreach (EventDefinitionHandle @event in typeDef.GetEvents())
		{
			EventAccessors accessors2 = reader.GetEventDefinition(@event).GetAccessors();
			if (!accessors2.Adder.IsNil)
			{
				hashSet.Add(accessors2.Adder);
			}
			if (!accessors2.Remover.IsNil)
			{
				hashSet.Add(accessors2.Remover);
			}
			if (!accessors2.Raiser.IsNil)
			{
				hashSet.Add(accessors2.Raiser);
			}
		}
		foreach (MethodDefinitionHandle method in typeDef.GetMethods())
		{
			if (hashSet.Contains(method))
			{
				continue;
			}
			MethodDefinition methodDefinition = reader.GetMethodDefinition(method);
			string text = reader.GetString(methodDefinition.Name);
			if (text.StartsWith('.') || text.StartsWith('<') || (methodDefinition.Attributes & MethodAttributes.MemberAccessMask) != MethodAttributes.Public)
			{
				continue;
			}
			try
			{
				MethodSignature<string> sig = methodDefinition.DecodeSignature(typeProvider, null);
				List<WinMdParameterInfo> methodParameters = GetMethodParameters(reader, methodDefinition, sig);
				string value = string.Join(", ", methodParameters.Select((WinMdParameterInfo p) => p.Type + " " + p.Name));
				list.Add(new WinMdMemberInfo
				{
					Name = text,
					Kind = MemberKind.Method,
					Signature = $"{sig.ReturnType} {text}({value})",
					ReturnType = sig.ReturnType,
					Parameters = methodParameters
				});
			}
			catch
			{
				list.Add(new WinMdMemberInfo
				{
					Name = text,
					Kind = MemberKind.Method,
					Signature = text + "(/* signature not decodable */)"
				});
			}
		}
		foreach (PropertyDefinitionHandle property2 in typeDef.GetProperties())
		{
			PropertyDefinition propertyDefinition = reader.GetPropertyDefinition(property2);
			string text2 = reader.GetString(propertyDefinition.Name);
			try
			{
				string returnType = propertyDefinition.DecodeSignature(typeProvider, null).ReturnType;
				PropertyAccessors accessors3 = propertyDefinition.GetAccessors();
				bool flag = false;
				if (!accessors3.Getter.IsNil && (reader.GetMethodDefinition(accessors3.Getter).Attributes & MethodAttributes.MemberAccessMask) == MethodAttributes.Public)
				{
					flag = true;
				}
				bool flag2 = false;
				if (!accessors3.Setter.IsNil && (reader.GetMethodDefinition(accessors3.Setter).Attributes & MethodAttributes.MemberAccessMask) == MethodAttributes.Public)
				{
					flag2 = true;
				}
				if (flag || flag2)
				{
					string text3 = (flag ? ((!flag2) ? "{ get; }" : "{ get; set; }") : ((!flag2) ? "{ }" : "{ set; }"));
					string value2 = text3;
					list.Add(new WinMdMemberInfo
					{
						Name = text2,
						Kind = MemberKind.Property,
						Signature = $"{returnType} {text2} {value2}",
						ReturnType = returnType
					});
				}
			}
			catch
			{
				list.Add(new WinMdMemberInfo
				{
					Name = text2,
					Kind = MemberKind.Property,
					Signature = "/* type not decodable */ " + text2
				});
			}
		}
		foreach (EventDefinitionHandle event2 in typeDef.GetEvents())
		{
			EventDefinition eventDefinition = reader.GetEventDefinition(event2);
			string text4 = reader.GetString(eventDefinition.Name);
			EventAccessors accessors4 = eventDefinition.GetAccessors();
			bool flag3 = false;
			if (!accessors4.Adder.IsNil && (reader.GetMethodDefinition(accessors4.Adder).Attributes & MethodAttributes.MemberAccessMask) == MethodAttributes.Public)
			{
				flag3 = true;
			}
			if (!flag3 && !accessors4.Remover.IsNil && (reader.GetMethodDefinition(accessors4.Remover).Attributes & MethodAttributes.MemberAccessMask) == MethodAttributes.Public)
			{
				flag3 = true;
			}
			if (flag3)
			{
				string handleTypeName = GetHandleTypeName(reader, eventDefinition.Type);
				list.Add(new WinMdMemberInfo
				{
					Name = text4,
					Kind = MemberKind.Event,
					Signature = "event " + handleTypeName + " " + text4,
					ReturnType = handleTypeName
				});
			}
		}
		return list;
	}

	private static List<WinMdParameterInfo> GetMethodParameters(MetadataReader reader, MethodDefinition method, MethodSignature<string> sig)
	{
		List<WinMdParameterInfo> list = new List<WinMdParameterInfo>();
		List<ParameterHandle> list2 = method.GetParameters().ToList();
		List<string> list3 = new List<string>();
		foreach (ParameterHandle item in list2)
		{
			Parameter parameter = reader.GetParameter(item);
			if (parameter.SequenceNumber > 0)
			{
				list3.Add(reader.GetString(parameter.Name));
			}
		}
		for (int i = 0; i < sig.ParameterTypes.Length; i++)
		{
			list.Add(new WinMdParameterInfo
			{
				Name = ((i < list3.Count) ? list3[i] : $"arg{i}"),
				Type = sig.ParameterTypes[i]
			});
		}
		return list;
	}

	internal static List<string> ParseEnumValues(MetadataReader reader, TypeDefinition typeDef)
	{
		List<string> list = new List<string>();
		foreach (FieldDefinitionHandle field in typeDef.GetFields())
		{
			FieldDefinition fieldDefinition = reader.GetFieldDefinition(field);
			string text = reader.GetString(fieldDefinition.Name);
			if (!(text == "value__") && (fieldDefinition.Attributes & FieldAttributes.FieldAccessMask) == FieldAttributes.Public && (fieldDefinition.Attributes & FieldAttributes.Static) != FieldAttributes.PrivateScope)
			{
				list.Add(text);
			}
		}
		return list;
	}

	private static string GetHandleTypeName(MetadataReader reader, EntityHandle handle)
	{
		return handle.Kind switch
		{
			HandleKind.TypeDefinition => GetTypeDefName(reader, (TypeDefinitionHandle)handle), 
			HandleKind.TypeReference => GetTypeRefName(reader, (TypeReferenceHandle)handle), 
			HandleKind.TypeSpecification => DecodeTypeSpecification(reader, (TypeSpecificationHandle)handle), 
			_ => "unknown", 
		};
	}

	private static string DecodeTypeSpecification(MetadataReader reader, TypeSpecificationHandle handle)
	{
		try
		{
			return reader.GetTypeSpecification(handle).DecodeSignature(new SimpleTypeProvider(), null);
		}
		catch
		{
			return "unknown";
		}
	}

	private static string? GetDeprecatedMessage(MetadataReader reader, CustomAttributeHandleCollection attributes)
	{
		foreach (var attrHandle in attributes)
		{
			try
			{
				var attr = reader.GetCustomAttribute(attrHandle);
				string? attrName = GetCustomAttributeName(reader, attr);
				if (attrName != null &&
					(attrName.Equals("DeprecatedAttribute", StringComparison.Ordinal) ||
					 attrName.Equals("ObsoleteAttribute", StringComparison.Ordinal)))
				{
					return DecodeDeprecatedMessage(reader, attr);
				}
			}
			catch
			{
			}
		}
		return null;
	}

	private static string? GetCustomAttributeName(MetadataReader reader, CustomAttribute attr)
	{
		if (attr.Constructor.Kind == HandleKind.MemberReference)
		{
			var memberRef = reader.GetMemberReference((MemberReferenceHandle)attr.Constructor);
			if (memberRef.Parent.Kind == HandleKind.TypeReference)
			{
				return reader.GetString(reader.GetTypeReference((TypeReferenceHandle)memberRef.Parent).Name);
			}
		}
		else if (attr.Constructor.Kind == HandleKind.MethodDefinition)
		{
			var methodDef = reader.GetMethodDefinition((MethodDefinitionHandle)attr.Constructor);
			var declaringType = reader.GetTypeDefinition(methodDef.GetDeclaringType());
			return reader.GetString(declaringType.Name);
		}
		return null;
	}

	private static string? DecodeDeprecatedMessage(MetadataReader reader, CustomAttribute attr)
	{
		try
		{
			var value = attr.DecodeValue(new CustomAttributeTypeProvider());
			if (value.FixedArguments.Length > 0 && value.FixedArguments[0].Value is string msg && !string.IsNullOrEmpty(msg))
			{
				return msg;
			}
		}
		catch
		{
		}
		return "This API is deprecated.";
	}

	private static void ApplyMemberDeprecation(MetadataReader reader, TypeDefinition typeDef, List<WinMdMemberInfo> members)
	{
		// Build a name->member lookup for matching
		var memberByName = new Dictionary<string, List<WinMdMemberInfo>>(StringComparer.Ordinal);
		foreach (var m in members)
		{
			if (!memberByName.TryGetValue(m.Name, out var list))
			{
				list = new List<WinMdMemberInfo>();
				memberByName[m.Name] = list;
			}
			list.Add(m);
		}

		// Check methods
		foreach (var methodHandle in typeDef.GetMethods())
		{
			var method = reader.GetMethodDefinition(methodHandle);
			string name = reader.GetString(method.Name);
			string? msg = GetDeprecatedMessage(reader, method.GetCustomAttributes());
			if (msg != null && memberByName.TryGetValue(name, out var matches))
			{
				foreach (var m in matches)
					m.DeprecatedMessage ??= msg;
			}
		}

		// Check properties
		foreach (var propHandle in typeDef.GetProperties())
		{
			var prop = reader.GetPropertyDefinition(propHandle);
			string name = reader.GetString(prop.Name);
			string? msg = GetDeprecatedMessage(reader, prop.GetCustomAttributes());
			if (msg != null && memberByName.TryGetValue(name, out var matches))
			{
				foreach (var m in matches)
					m.DeprecatedMessage ??= msg;
			}
		}

		// Check events
		foreach (var eventHandle in typeDef.GetEvents())
		{
			var evt = reader.GetEventDefinition(eventHandle);
			string name = reader.GetString(evt.Name);
			string? msg = GetDeprecatedMessage(reader, evt.GetCustomAttributes());
			if (msg != null && memberByName.TryGetValue(name, out var matches))
			{
				foreach (var m in matches)
					m.DeprecatedMessage ??= msg;
			}
		}
	}
}
