import { z } from "zod";

export type Sourced<T> = {
  value: T;
  sourcePage?: number;
};

export const ClaimBasics = z.object({
  claimNumber:      z.string().nullable(),
  carrier:          z.string().nullable(),
  policyNumber:     z.string().nullable(),
  lossType:         z.string().nullable(),
  dateOfLoss:       z.string().nullable(),
  dateReported:     z.string().nullable(),
  denialReason:     z.string().nullable(),
  initialOutcome:   z.enum(["approved", "denied", "partial", "pending"]).nullable(),
  finalOutcome:     z.enum(["approved", "denied", "partial", "pending"]).nullable(),
  denialOverturned: z.boolean().nullable(),
});

export const People = z.object({
  homeownerName:  z.string().nullable(),
  homeownerPhone: z.string().nullable(),
  homeownerEmail: z.string().nullable(),
  insuredName:    z.string().nullable(),
  propertyAddress: z.string().nullable(),
  city:           z.string().nullable(),
  state:          z.string().nullable(),
  zipCode:        z.string().nullable(),
  adjusterName:   z.string().nullable(),
  adjusterPhone:  z.string().nullable(),
  adjusterEmail:  z.string().nullable(),
  iaFirm:         z.string().nullable(),
});

export const Financials = z.object({
  rcv:                    z.number().nullable(),
  acv:                    z.number().nullable(),
  deductible:             z.number().nullable(),
  netClaim:               z.number().nullable(),
  supplementTotal:        z.number().nullable(),
  depreciation:           z.number().nullable(),
  supplementRequested:    z.number().nullable(),
  supplementApproved:     z.number().nullable(),
  approvedAmount:         z.number().nullable(),
  claimAmount:            z.number().nullable(),
  finalPaid:              z.number().nullable(),
  recoverableDepreciation: z.number().nullable(),
});

export const Dates = z.object({
  inspectionDate: z.string().nullable(),
  estimateDate:   z.string().nullable(),
  denialDate:     z.string().nullable(),
  approvalDate:   z.string().nullable(),
  paymentDate:    z.string().nullable(),
});

export const Vendors = z.object({
  contractor:     z.string().nullable(),
  engineer:       z.string().nullable(),
  publicAdjuster: z.string().nullable(),
  attorney:       z.string().nullable(),
  vendorName:     z.string().nullable(),
});

export const Evidence = z.object({
  photoInspectionDone:    z.boolean().nullable(),
  weatherEventConfirmed:  z.boolean().nullable(),
  scopeOfLossPresent:     z.boolean().nullable(),
});

export type ClaimBasicsType  = z.infer<typeof ClaimBasics>;
export type PeopleType       = z.infer<typeof People>;
export type FinancialsType   = z.infer<typeof Financials>;
export type DatesType        = z.infer<typeof Dates>;
export type VendorsType      = z.infer<typeof Vendors>;
export type EvidenceType     = z.infer<typeof Evidence>;

export interface SectionedExtraction {
  basics:     ClaimBasicsType;
  people:     PeopleType;
  financials: FinancialsType;
  dates:      DatesType;
  vendors:    VendorsType;
  evidence:   EvidenceType;
}
