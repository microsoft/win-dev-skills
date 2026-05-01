// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System;
using System.Reflection.Metadata;

internal sealed class CustomAttributeTypeProvider : ICustomAttributeTypeProvider<object?>
{
	public object? GetPrimitiveType(PrimitiveTypeCode typeCode) => null;
	public object? GetSystemType() => null;
	public object? GetSZArrayType(object? elementType) => null;
	public object? GetTypeFromDefinition(MetadataReader reader, TypeDefinitionHandle handle, byte rawTypeKind) => null;
	public object? GetTypeFromReference(MetadataReader reader, TypeReferenceHandle handle, byte rawTypeKind) => null;
	public object? GetTypeFromSerializedName(string name) => null;
	public PrimitiveTypeCode GetUnderlyingEnumType(object? type) => PrimitiveTypeCode.Int32;
	public bool IsSystemType(object? type) => false;
}
