// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Collections.Immutable;
using System.Reflection.Metadata;

internal sealed class SimpleTypeProvider : ISignatureTypeProvider<string, object?>, IConstructedTypeProvider<string>, ISZArrayTypeProvider<string>, ISimpleTypeProvider<string>
{
	public string GetPrimitiveType(PrimitiveTypeCode typeCode)
	{
		return typeCode switch
		{
			PrimitiveTypeCode.Boolean => "Boolean", 
			PrimitiveTypeCode.Byte => "Byte", 
			PrimitiveTypeCode.SByte => "SByte", 
			PrimitiveTypeCode.Char => "Char", 
			PrimitiveTypeCode.Int16 => "Int16", 
			PrimitiveTypeCode.UInt16 => "UInt16", 
			PrimitiveTypeCode.Int32 => "Int32", 
			PrimitiveTypeCode.UInt32 => "UInt32", 
			PrimitiveTypeCode.Int64 => "Int64", 
			PrimitiveTypeCode.UInt64 => "UInt64", 
			PrimitiveTypeCode.Single => "Single", 
			PrimitiveTypeCode.Double => "Double", 
			PrimitiveTypeCode.String => "String", 
			PrimitiveTypeCode.Object => "Object", 
			PrimitiveTypeCode.Void => "void", 
			PrimitiveTypeCode.IntPtr => "IntPtr", 
			PrimitiveTypeCode.UIntPtr => "UIntPtr", 
			PrimitiveTypeCode.TypedReference => "TypedReference", 
			_ => typeCode.ToString(), 
		};
	}

	public string GetTypeFromDefinition(MetadataReader reader, TypeDefinitionHandle handle, byte rawTypeKind)
	{
		TypeDefinition typeDefinition = reader.GetTypeDefinition(handle);
		string text = reader.GetString(typeDefinition.Name);
		string text2 = reader.GetString(typeDefinition.Namespace);
		if (!string.IsNullOrEmpty(text2))
		{
			return text2 + "." + text;
		}
		return text;
	}

	public string GetTypeFromReference(MetadataReader reader, TypeReferenceHandle handle, byte rawTypeKind)
	{
		TypeReference typeReference = reader.GetTypeReference(handle);
		string text = reader.GetString(typeReference.Name);
		string text2 = reader.GetString(typeReference.Namespace);
		if (!string.IsNullOrEmpty(text2))
		{
			return text2 + "." + text;
		}
		return text;
	}

	public string GetSZArrayType(string elementType)
	{
		return elementType + "[]";
	}

	public string GetArrayType(string elementType, ArrayShape shape)
	{
		return elementType + "[" + new string(',', shape.Rank - 1) + "]";
	}

	public string GetByReferenceType(string elementType)
	{
		return "ref " + elementType;
	}

	public string GetPointerType(string elementType)
	{
		return elementType + "*";
	}

	public string GetPinnedType(string elementType)
	{
		return elementType;
	}

	public string GetGenericInstantiation(string genericType, ImmutableArray<string> typeArguments)
	{
		string text = genericType;
		int num = text.IndexOf('`');
		if (num >= 0)
		{
			text = text.Substring(0, num);
		}
		return text + "<" + string.Join(", ", typeArguments) + ">";
	}

	public string GetGenericMethodParameter(object? genericContext, int index)
	{
		return $"TMethod{index}";
	}

	public string GetGenericTypeParameter(object? genericContext, int index)
	{
		return $"T{index}";
	}

	public string GetModifiedType(string modifier, string unmodifiedType, bool isRequired)
	{
		return unmodifiedType;
	}

	public string GetFunctionPointerType(MethodSignature<string> signature)
	{
		return "delegate*";
	}

	public string GetTypeFromSpecification(MetadataReader reader, object? genericContext, TypeSpecificationHandle handle, byte rawTypeKind)
	{
		return reader.GetTypeSpecification(handle).DecodeSignature(this, genericContext);
	}
}
