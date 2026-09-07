import { CONFIRM_PAUSED_PHRASE } from "@/lib/safety";
import {
  DESCRIPTION_MIN,
  HEADLINE_MIN,
  MIN_BID_MICROS,
  MIN_BUDGET_MICROS,
} from "@/lib/search-draft";
import type { WizardAdGroup, WizardTarget } from "@/lib/search-wizard-map";

export const SEARCH_CREATE_PATH = "/ops/campaigns/new/search";

export const SEARCH_CREATE_NOTE =
  "Dry-run / validateOnly first. Creates stay PAUSED. Type CREATE PAUSED only after turning dry-run off. No Enable.";

export const SEARCH_CREATE_STEPS = [
  { id: "S0", title: "Account" },
  { id: "S1", title: "Basics" },
  { id: "S2", title: "Ad groups" },
  { id: "S3", title: "Keywords" },
  { id: "S4", title: "RSA" },
  { id: "S5", title: "Targeting" },
  { id: "S6", title: "Bidding" },
  { id: "S7", title: "Review" },
  { id: "S8", title: "Result" },
] as const;

export type SearchCreateStepId = (typeof SEARCH_CREATE_STEPS)[number]["id"];

export type SearchCreateFieldErrors = {
  customerId?: string;
  name?: string;
  budgetDollars?: string;
  groups?: string;
  keywords?: string;
  ads?: string;
  targets?: string;
  confirmPhrase?: string;
};

export type SearchCreateFormValues = {
  customerId: string;
  name: string;
  budgetDollars: string;
  groups: WizardAdGroup[];
  targets: WizardTarget[];
  confirmPhrase?: string;
  dryRun?: boolean;
};

export function searchCreatePath(draftId?: string | null): string {
  if (!draftId?.trim()) return SEARCH_CREATE_PATH;
  return `${SEARCH_CREATE_PATH}?draftId=${encodeURIComponent(draftId.trim())}`;
}

export function searchCreateChatVisible(step: number): boolean {
  return step >= 1 && step <= 7;
}

function dollarsToMicros(value: string): number | null {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000);
}

export function validateSearchCreateForm(values: SearchCreateFormValues): SearchCreateFieldErrors {
  const errors: SearchCreateFieldErrors = {};

  if (!values.customerId.trim()) {
    errors.customerId = "Select an enabled client account.";
  }

  if (!values.name.trim()) {
    errors.name = "Campaign name is required.";
  }

  const budgetMicros = dollarsToMicros(values.budgetDollars);
  if (budgetMicros == null) {
    errors.budgetDollars = "Daily budget must be a number.";
  } else if (budgetMicros < MIN_BUDGET_MICROS) {
    errors.budgetDollars = "Daily budget must be at least 0.01.";
  }

  if (!values.groups.length) {
    errors.groups = "At least one ad group is required.";
  } else {
    const unnamed = values.groups.find((group) => !group.name.trim());
    if (unnamed) {
      errors.groups = "Each ad group needs a name.";
    } else {
      const thinBid = values.groups.find((group) => {
        const micros = dollarsToMicros(group.defaultBidDollars);
        return micros == null || micros < MIN_BID_MICROS;
      });
      if (thinBid) {
        errors.groups = `Ad group "${thinBid.name}" default CPC must be at least 0.01.`;
      }
    }
  }

  const missingKeyword = values.groups.find(
    (group) => !group.keywords.some((keyword) => keyword.text.trim()),
  );
  if (missingKeyword) {
    errors.keywords = `Ad group "${missingKeyword.name}" needs at least one keyword.`;
  }

  const thinAd = values.groups.find((group) => {
    const ad = group.ads[0];
    if (!ad) return true;
    const headlines = ad.headlines.map((item) => item.trim()).filter(Boolean);
    const descriptions = ad.descriptions.map((item) => item.trim()).filter(Boolean);
    if (headlines.length < HEADLINE_MIN || descriptions.length < DESCRIPTION_MIN) return true;
    try {
      const url = new URL(ad.finalUrl);
      return url.protocol !== "http:" && url.protocol !== "https:";
    } catch {
      return true;
    }
  });
  if (thinAd) {
    errors.ads = `Ad group "${thinAd.name}" needs a valid RSA (URL, ${HEADLINE_MIN} headlines, ${DESCRIPTION_MIN} descriptions).`;
  }

  if (!values.targets.some((target) => target.type === "LANGUAGE" && target.included)) {
    errors.targets = "At least one language target is required.";
  }

  if (values.dryRun === false) {
    const phrase = (values.confirmPhrase ?? "").trim();
    if (phrase && phrase !== CONFIRM_PAUSED_PHRASE) {
      errors.confirmPhrase = `Type ${CONFIRM_PAUSED_PHRASE} exactly.`;
    }
  }

  return errors;
}

export function isSearchCreateFormValid(errors: SearchCreateFieldErrors): boolean {
  return !errors.customerId && !errors.name && !errors.budgetDollars && !errors.groups && !errors.keywords && !errors.ads && !errors.targets;
}

export function isSearchCreateApplyReady(input: {
  connected: boolean;
  dryRun: boolean;
  confirmPhrase: string;
  errors: SearchCreateFieldErrors;
}): boolean {
  return (
    input.connected &&
    !input.dryRun &&
    input.confirmPhrase.trim() === CONFIRM_PAUSED_PHRASE &&
    isSearchCreateFormValid(input.errors)
  );
}
