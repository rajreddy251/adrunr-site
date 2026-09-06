import { describe, expect, it } from "vitest";

import {
  assertEditApplyConfirm,
  assertNoStatusInMutate,
  buildCampaignEditMutate,
  deriveEditFieldKinds,
  parseCampaignEditTree,
  refuseEnableOnEdit,
} from "@/lib/campaign-edit";
import { assertEditDoesNotEnable, assertPausedOnly, CONFIRM_EDIT_PHRASE } from "@/lib/safety";

const baseTree = {
  customerId: "123-456-7890",
  campaignExternalId: "1111111111",
  googleCampaignResourceName: "customers/1234567890/campaigns/1111111111",
  budgetResourceName: "customers/1234567890/campaignBudgets/111",
  currentName: "Demo Search — Brand",
  proposedName: "Demo Search — Brand (ops)",
  currentDailyBudgetMicros: 25_000_000,
  proposedDailyBudgetMicros: 30_000_000,
  bids: [
    {
      adGroupExternalId: "2222222222",
      googleAdGroupResourceName: "customers/1234567890/adGroups/2222222222",
      adGroupName: "Brand exact",
      proposedBidMicros: 1_500_000,
    },
  ],
  targets: [
    {
      type: "GEO",
      valueText: "United States",
      criterionText: "geoTargetConstants/2840",
      included: true,
    },
  ],
};

describe("safe campaign edit payload", () => {
  it("defaults validateOnly and never writes status", () => {
    const tree = parseCampaignEditTree(baseTree);
    const request = buildCampaignEditMutate(tree, true);
    expect(request.validateOnly).toBe(true);
    expect(request.customerId).toBe("1234567890");
    expect(request.mutateOperations).toHaveLength(4);
    expect(JSON.stringify(request.mutateOperations)).not.toMatch(/"status"/);
    expect(JSON.stringify(request.mutateOperations)).not.toMatch(/ENABLED/);
    expect(deriveEditFieldKinds(tree)).toEqual(["NAME", "BUDGET", "BID", "TARGETING"]);
  });

  it("updates name, budget, bid, and targeting only", () => {
    const request = buildCampaignEditMutate(parseCampaignEditTree(baseTree), false);
    expect(request.validateOnly).toBe(false);
    const campaign = (
      request.mutateOperations[0] as { campaignOperation: { update: { name: string; resourceName: string } } }
    ).campaignOperation.update;
    expect(campaign.name).toBe("Demo Search — Brand (ops)");
    expect(campaign.resourceName).toContain("/campaigns/1111111111");
    expect(campaign).not.toHaveProperty("status");
    const budget = (
      request.mutateOperations[1] as {
        campaignBudgetOperation: { update: { amountMicros: string } };
      }
    ).campaignBudgetOperation.update;
    expect(budget.amountMicros).toBe("30000000");
    const bid = (
      request.mutateOperations[2] as { adGroupOperation: { update: { cpcBidMicros: string } } }
    ).adGroupOperation.update;
    expect(bid.cpcBidMicros).toBe("1500000");
    expect(bid).not.toHaveProperty("status");
  });

  it("refuses status ENABLED and enable / unpause / go-live", () => {
    expect(() => parseCampaignEditTree({ ...baseTree, status: "ENABLED" })).toThrow(/enable path/);
    expect(() => refuseEnableOnEdit({ ...baseTree, enable: true })).toThrow(/never enables/);
    expect(() => refuseEnableOnEdit({ ...baseTree, unpause: true })).toThrow(/never enables/);
    expect(() => refuseEnableOnEdit({ ...baseTree, goLive: true })).toThrow(/never enables/);
    expect(() =>
      refuseEnableOnEdit({
        ...baseTree,
        mutateOperations: [{ campaignOperation: { update: { status: "ENABLED" } } }],
      }),
    ).toThrow(/ENABLE/);
    expect(() => assertPausedOnly("ENABLED")).toThrow(/enable path/);
    expect(() => assertEditDoesNotEnable("ENABLED")).toThrow(/enable path/);
  });

  it("refuses any status mutate, including PAUSED", () => {
    expect(() => parseCampaignEditTree({ ...baseTree, status: "PAUSED" })).toThrow(/never set status/);
    expect(() =>
      assertNoStatusInMutate([
        { campaignOperation: { update: { resourceName: "customers/1/campaigns/1", status: "PAUSED" } } },
      ]),
    ).toThrow(/must not include status/);
  });

  it("requires EDIT SAFE to apply and prefers dry-run", () => {
    expect(() => assertEditApplyConfirm(false, undefined)).toThrow(/EDIT SAFE/);
    expect(() => assertEditApplyConfirm(false, "CREATE PAUSED")).toThrow(/EDIT SAFE/);
    expect(() => assertEditApplyConfirm(false, CONFIRM_EDIT_PHRASE)).not.toThrow();
    expect(() => assertEditApplyConfirm(true, undefined)).not.toThrow();
  });

  it("rejects targeting that is not GEO or LANGUAGE", () => {
    expect(() =>
      parseCampaignEditTree({
        ...baseTree,
        targets: [{ type: "AUDIENCE", valueText: "list", criterionText: "x", included: true }],
      }),
    ).toThrow(/not allowed on edit/);
  });

  it("requires a real field change before mutate", () => {
    expect(() =>
      buildCampaignEditMutate(
        parseCampaignEditTree({
          customerId: "1234567890",
          campaignExternalId: "1111111111",
          currentName: "Same",
          proposedName: "Same",
        }),
        true,
      ),
    ).toThrow(/No safe edit fields/);
  });
});
