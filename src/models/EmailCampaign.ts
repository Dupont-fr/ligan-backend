import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const EMAIL_CAMPAIGN_STATUS = ['DRAFT', 'SENT', 'SENDING', 'FAILED'] as const;
export type EmailCampaignStatus = (typeof EMAIL_CAMPAIGN_STATUS)[number];

export const EMAIL_CAMPAIGN_RECIPIENT_TYPE = ['ALL', 'BY_ROLE', 'MANUAL'] as const;
export type EmailCampaignRecipientType = (typeof EMAIL_CAMPAIGN_RECIPIENT_TYPE)[number];

const emailCampaignSchema = new Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    preheader: { type: String, trim: true, maxlength: 200 },
    bodyHtml: { type: String, required: true },
    bodyText: { type: String, required: true },
    recipientType: { type: String, enum: EMAIL_CAMPAIGN_RECIPIENT_TYPE, required: true },
    recipientRoles: { type: [String], enum: ['CUSTOMER', 'PROFESSIONAL', 'ADMIN'], default: [] },
    recipientUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    status: { type: String, enum: EMAIL_CAMPAIGN_STATUS, default: 'DRAFT' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    sentAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

export type EmailCampaignDocument = InferSchemaType<typeof emailCampaignSchema>;

export const EmailCampaign = model<EmailCampaignDocument>('EmailCampaign', emailCampaignSchema);
