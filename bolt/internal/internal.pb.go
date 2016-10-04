// Code generated by protoc-gen-gogo.
// source: internal.proto
// DO NOT EDIT!

/*
Package internal is a generated protocol buffer package.

It is generated from these files:
	internal.proto

It has these top-level messages:
	Exploration
	Source
	Server
*/
package internal

import proto "github.com/gogo/protobuf/proto"
import fmt "fmt"
import math "math"

// Reference imports to suppress errors if they are not otherwise used.
var _ = proto.Marshal
var _ = fmt.Errorf
var _ = math.Inf

// This is a compile-time assertion to ensure that this generated file
// is compatible with the proto package it is being compiled against.
// A compilation error at this line likely means your copy of the
// proto package needs to be updated.
const _ = proto.GoGoProtoPackageIsVersion2 // please upgrade the proto package

type Exploration struct {
	ID        int64  `protobuf:"varint,1,opt,name=ID,json=iD,proto3" json:"ID,omitempty"`
	Name      string `protobuf:"bytes,2,opt,name=Name,json=name,proto3" json:"Name,omitempty"`
	UserID    int64  `protobuf:"varint,3,opt,name=UserID,json=userID,proto3" json:"UserID,omitempty"`
	Data      string `protobuf:"bytes,4,opt,name=Data,json=data,proto3" json:"Data,omitempty"`
	CreatedAt int64  `protobuf:"varint,5,opt,name=CreatedAt,json=createdAt,proto3" json:"CreatedAt,omitempty"`
	UpdatedAt int64  `protobuf:"varint,6,opt,name=UpdatedAt,json=updatedAt,proto3" json:"UpdatedAt,omitempty"`
	Default   bool   `protobuf:"varint,7,opt,name=Default,json=default,proto3" json:"Default,omitempty"`
}

func (m *Exploration) Reset()                    { *m = Exploration{} }
func (m *Exploration) String() string            { return proto.CompactTextString(m) }
func (*Exploration) ProtoMessage()               {}
func (*Exploration) Descriptor() ([]byte, []int) { return fileDescriptorInternal, []int{0} }

type Source struct {
	ID       int64    `protobuf:"varint,1,opt,name=ID,json=iD,proto3" json:"ID,omitempty"`
	Name     string   `protobuf:"bytes,2,opt,name=Name,json=name,proto3" json:"Name,omitempty"`
	Type     string   `protobuf:"bytes,3,opt,name=Type,json=type,proto3" json:"Type,omitempty"`
	Username string   `protobuf:"bytes,4,opt,name=Username,json=username,proto3" json:"Username,omitempty"`
	Password string   `protobuf:"bytes,5,opt,name=Password,json=password,proto3" json:"Password,omitempty"`
	URLs     []string `protobuf:"bytes,6,rep,name=URLs,json=uRLs" json:"URLs,omitempty"`
	Default  bool     `protobuf:"varint,7,opt,name=Default,json=default,proto3" json:"Default,omitempty"`
}

func (m *Source) Reset()                    { *m = Source{} }
func (m *Source) String() string            { return proto.CompactTextString(m) }
func (*Source) ProtoMessage()               {}
func (*Source) Descriptor() ([]byte, []int) { return fileDescriptorInternal, []int{1} }

type Server struct {
	ID       int64  `protobuf:"varint,1,opt,name=ID,json=iD,proto3" json:"ID,omitempty"`
	Name     string `protobuf:"bytes,2,opt,name=Name,json=name,proto3" json:"Name,omitempty"`
	Username string `protobuf:"bytes,3,opt,name=Username,json=username,proto3" json:"Username,omitempty"`
	Password string `protobuf:"bytes,4,opt,name=Password,json=password,proto3" json:"Password,omitempty"`
	URL      string `protobuf:"bytes,5,opt,name=URL,json=uRL,proto3" json:"URL,omitempty"`
	SrcID    int64  `protobuf:"varint,6,opt,name=SrcID,json=srcID,proto3" json:"SrcID,omitempty"`
}

func (m *Server) Reset()                    { *m = Server{} }
func (m *Server) String() string            { return proto.CompactTextString(m) }
func (*Server) ProtoMessage()               {}
func (*Server) Descriptor() ([]byte, []int) { return fileDescriptorInternal, []int{2} }

func init() {
	proto.RegisterType((*Exploration)(nil), "internal.Exploration")
	proto.RegisterType((*Source)(nil), "internal.Source")
	proto.RegisterType((*Server)(nil), "internal.Server")
}

func init() { proto.RegisterFile("internal.proto", fileDescriptorInternal) }

var fileDescriptorInternal = []byte{
	// 299 bytes of a gzipped FileDescriptorProto
	0x1f, 0x8b, 0x08, 0x00, 0x00, 0x09, 0x6e, 0x88, 0x02, 0xff, 0x8c, 0x91, 0xcd, 0x4a, 0x33, 0x31,
	0x14, 0x86, 0x99, 0x4e, 0x9a, 0xce, 0x9c, 0x0f, 0xca, 0x47, 0x10, 0x09, 0xe2, 0x62, 0xe8, 0xaa,
	0x2b, 0x37, 0x5e, 0x81, 0x18, 0x17, 0x85, 0x41, 0x24, 0x75, 0x2e, 0x20, 0x76, 0x8e, 0x50, 0x68,
	0x27, 0x21, 0x3f, 0x6a, 0xef, 0xc1, 0xeb, 0xf0, 0x06, 0xbc, 0x41, 0x49, 0x9a, 0x01, 0x71, 0x51,
	0xba, 0x7c, 0xce, 0xfb, 0x72, 0x78, 0x92, 0x03, 0xf3, 0xed, 0xe0, 0xd1, 0x0e, 0x6a, 0x77, 0x63,
	0xac, 0xf6, 0x9a, 0x55, 0x23, 0x2f, 0xbe, 0x0b, 0xf8, 0xf7, 0xf0, 0x61, 0x76, 0xda, 0x2a, 0xbf,
	0xd5, 0x03, 0x9b, 0xc3, 0x64, 0x25, 0x78, 0xd1, 0x14, 0xcb, 0x52, 0x4e, 0xb6, 0x82, 0x31, 0x20,
	0x8f, 0x6a, 0x8f, 0x7c, 0xd2, 0x14, 0xcb, 0x5a, 0x92, 0x41, 0xed, 0x91, 0x5d, 0x02, 0xed, 0x1c,
	0xda, 0x95, 0xe0, 0x65, 0xea, 0xd1, 0x90, 0x28, 0x76, 0x85, 0xf2, 0x8a, 0x93, 0x63, 0xb7, 0x57,
	0x5e, 0xb1, 0x6b, 0xa8, 0xef, 0x2d, 0x2a, 0x8f, 0xfd, 0x9d, 0xe7, 0xd3, 0x54, 0xaf, 0x37, 0xe3,
	0x20, 0xa6, 0x9d, 0xe9, 0x73, 0x4a, 0x8f, 0x69, 0x18, 0x07, 0x8c, 0xc3, 0x4c, 0xe0, 0xab, 0x0a,
	0x3b, 0xcf, 0x67, 0x4d, 0xb1, 0xac, 0xe4, 0xac, 0x3f, 0xe2, 0xe2, 0xab, 0x00, 0xba, 0xd6, 0xc1,
	0x6e, 0xf0, 0x2c, 0x61, 0x06, 0xe4, 0xf9, 0x60, 0x30, 0xe9, 0xd6, 0x92, 0xf8, 0x83, 0x41, 0x76,
	0x05, 0x55, 0x7c, 0x44, 0xcc, 0xb3, 0x70, 0x15, 0x32, 0xc7, 0xec, 0x49, 0x39, 0xf7, 0xae, 0x6d,
	0x9f, 0x9c, 0x6b, 0x59, 0x99, 0xcc, 0x71, 0x57, 0x27, 0x5b, 0xc7, 0x69, 0x53, 0xc6, 0x5d, 0x41,
	0xb6, 0xee, 0x84, 0xe8, 0x67, 0x14, 0x45, 0xfb, 0x86, 0xf6, 0x2c, 0xd1, 0xdf, 0x52, 0xe5, 0x09,
	0x29, 0xf2, 0x47, 0xea, 0x3f, 0x94, 0x9d, 0x6c, 0xb3, 0x6b, 0x19, 0x64, 0xcb, 0x2e, 0x60, 0xba,
	0xb6, 0x9b, 0x95, 0xc8, 0xbf, 0x3a, 0x75, 0x11, 0x5e, 0x68, 0x3a, 0xff, 0xed, 0x4f, 0x00, 0x00,
	0x00, 0xff, 0xff, 0xd9, 0x74, 0xaa, 0x1f, 0x10, 0x02, 0x00, 0x00,
}
