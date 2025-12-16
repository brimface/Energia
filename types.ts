export interface BillData {
  monthlyConsumptionKwh: number;
  contractedPowerKva: number;
  audiovisualTax: number; // CAV
  dgegTax: number; // Taxa Exploração DGEG
  ieceTax: number; // IEC
  socialTariff: number; // Value of discount (usually negative)
  totalAmount: number; // Total extracted from bill
  billingPeriodDays: number;
  
  // Current unit prices (optional, for reference)
  currentPowerPricePerDay?: number;
  currentEnergyPricePerKwh?: number;
}

export interface NewOfferData {
  supplierName?: string;
  powerPricePerDay: number;
  energyPricePerKwh: number;
}

export interface SavedSimulation {
  version: string;
  timestamp: string;
  billData: BillData;
  newOffer: NewOfferData;
}

export interface ComparisonResult {
  currentTotal: number;
  newTotal: number;
  currentBase: number; // Total without VAT
  newBase: number;     // Total without VAT
  difference: number;
  isCheaper: boolean;
  yearlySavings: number;
  details: {
    energyCost: { current: number; new: number };
    powerCost: { current: number; new: number };
    taxes: { current: number; new: number };
  };
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}