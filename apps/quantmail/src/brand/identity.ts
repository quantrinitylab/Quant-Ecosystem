import { createEndorsedProductLockup, quantrinityMasterbrand } from '@quant/brand';

/** Canonical product identities used by QuantMail surfaces and metadata. */
export const quantMailBrandLockup = Object.freeze(createEndorsedProductLockup('QuantMail'));
export const quantAiBrandLockup = Object.freeze(createEndorsedProductLockup('QuantAI'));

export const quantMailBrandMetadata = Object.freeze({
  title: `${quantMailBrandLockup.productName} ${quantMailBrandLockup.byline}`,
  description: `A focused, intelligent inbox by ${quantrinityMasterbrand.displayName} — built in India for the world.`,
  applicationName: quantMailBrandLockup.productName,
  companyDomain: quantrinityMasterbrand.companyDomain,
  identityDomain: quantrinityMasterbrand.identityDomain,
});
