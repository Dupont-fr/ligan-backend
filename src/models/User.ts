import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const USER_ROLES = ['CUSTOMER', 'PROFESSIONAL', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthUser {
  id: string;
  role: UserRole;
}

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, trim: true, maxlength: 30, default: undefined },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'CUSTOMER',
      required: true,
    },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: undefined },
    verificationTokenExpires: { type: Date, default: undefined },
    resetPasswordToken: { type: String, default: undefined },
    resetPasswordExpires: { type: Date, default: undefined },
    refreshTokens: { type: [String], default: [] },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User = model<UserDocument>('User', userSchema);

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toPublicUser(doc: HydratedDocument<UserDocument>): PublicUser {
  return {
    id: doc._id.toString(),
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    ...(doc.phone ? { phone: doc.phone } : {}),
    role: doc.role,
    isVerified: doc.isVerified,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}