import type {
  ClientMemberRole,
  MembershipRole,
  PermissionAction,
  PermissionResource,
} from "@prisma/client";

export const ALL_RESOURCES: PermissionResource[] = [
  "ORGANIZATION",
  "MEMBERSHIP",
  "CLIENT",
  "WORKSPACE",
  "INTEGRATION_PROVIDER",
  "OAUTH_CONNECTION",
  "EXTERNAL_ACCOUNT",
  "EXTERNAL_ENTITY",
  "CAMPAIGN_OP",
  "SEARCH_CAMPAIGN_DRAFT",
  "DISPLAY_CAMPAIGN_DRAFT",
  "PERFORMANCE_MAX_CAMPAIGN_DRAFT",
  "SYNC_JOB",
  "AUDIT_EVENT",
  "BILLING",
];

export const ALL_ACTIONS: PermissionAction[] = [
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "CONNECT",
  "DISCONNECT",
  "LIST",
  "DRY_RUN",
  "APPLY_PAUSED",
  "INVITE",
  "ASSIGN",
  "SYNC",
];

const READ_LIST: PermissionAction[] = ["READ", "LIST"];

function expand(
  resources: PermissionResource[] | "ALL",
  actions: PermissionAction[] | "ALL",
): Array<{ resource: PermissionResource; action: PermissionAction }> {
  const res = resources === "ALL" ? ALL_RESOURCES : resources;
  const acts = actions === "ALL" ? ALL_ACTIONS : actions;
  return res.flatMap((resource) => acts.map((action) => ({ resource, action })));
}

const ROLE_GRANTS: Record<
  MembershipRole,
  Array<{ resource: PermissionResource; action: PermissionAction }>
> = {
  PLATFORM_OPS: expand("ALL", "ALL"),
  AGENCY_OWNER: expand("ALL", "ALL"),
  AGENCY_ADMIN: [
    ...expand(
      ALL_RESOURCES.filter((r) => r !== "BILLING"),
      "ALL",
    ),
    ...expand(["BILLING"], READ_LIST),
  ],
  AGENCY_MANAGER: [
    ...expand(["ORGANIZATION", "INTEGRATION_PROVIDER", "AUDIT_EVENT", "BILLING"], READ_LIST),
    ...expand(["MEMBERSHIP"], ["READ", "LIST", "INVITE"]),
    ...expand(["CLIENT"], ["CREATE", "READ", "UPDATE", "LIST", "ASSIGN"]),
    ...expand(["WORKSPACE"], ["CREATE", "READ", "UPDATE", "LIST"]),
    ...expand(["OAUTH_CONNECTION"], ["CONNECT", "DISCONNECT", "READ", "LIST"]),
    ...expand(["EXTERNAL_ACCOUNT", "EXTERNAL_ENTITY"], ["READ", "UPDATE", "LIST", "SYNC"]),
    ...expand(["CAMPAIGN_OP"], ["CREATE", "READ", "LIST", "DRY_RUN", "APPLY_PAUSED"]),
    ...expand(
      ["SEARCH_CAMPAIGN_DRAFT", "DISPLAY_CAMPAIGN_DRAFT", "PERFORMANCE_MAX_CAMPAIGN_DRAFT"],
      ["CREATE", "READ", "UPDATE", "DELETE", "LIST", "DRY_RUN", "APPLY_PAUSED"],
    ),
    ...expand(["SYNC_JOB"], ["CREATE", "READ", "LIST", "SYNC"]),
  ],
  AGENT: [
    ...expand(
      ["CLIENT", "WORKSPACE", "EXTERNAL_ACCOUNT", "EXTERNAL_ENTITY", "AUDIT_EVENT", "SYNC_JOB"],
      READ_LIST,
    ),
    ...expand(["CAMPAIGN_OP"], ["CREATE", "READ", "LIST", "DRY_RUN"]),
    ...expand(
      ["SEARCH_CAMPAIGN_DRAFT", "DISPLAY_CAMPAIGN_DRAFT", "PERFORMANCE_MAX_CAMPAIGN_DRAFT"],
      ["CREATE", "READ", "UPDATE", "LIST", "DRY_RUN"],
    ),
    ...expand(["OAUTH_CONNECTION"], READ_LIST),
  ],
  VIEWER: expand(
    [
      "ORGANIZATION",
      "CLIENT",
      "WORKSPACE",
      "INTEGRATION_PROVIDER",
      "OAUTH_CONNECTION",
      "EXTERNAL_ACCOUNT",
      "EXTERNAL_ENTITY",
      "CAMPAIGN_OP",
      "SEARCH_CAMPAIGN_DRAFT",
      "DISPLAY_CAMPAIGN_DRAFT",
      "PERFORMANCE_MAX_CAMPAIGN_DRAFT",
      "SYNC_JOB",
      "AUDIT_EVENT",
    ],
    READ_LIST,
  ),
  FINANCE: [
    ...expand(["BILLING"], ["READ", "LIST", "UPDATE"]),
    ...expand(
      ["ORGANIZATION", "CLIENT", "CAMPAIGN_OP", "SEARCH_CAMPAIGN_DRAFT", "DISPLAY_CAMPAIGN_DRAFT", "PERFORMANCE_MAX_CAMPAIGN_DRAFT", "AUDIT_EVENT", "EXTERNAL_ACCOUNT"],
      READ_LIST,
    ),
  ],
};

const CLIENT_ROLE_GRANTS: Record<
  ClientMemberRole,
  Array<{ resource: PermissionResource; action: PermissionAction }>
> = {
  CLIENT_ADMIN: expand(
    ["EXTERNAL_ACCOUNT", "CAMPAIGN_OP", "SEARCH_CAMPAIGN_DRAFT", "DISPLAY_CAMPAIGN_DRAFT", "PERFORMANCE_MAX_CAMPAIGN_DRAFT", "AUDIT_EVENT"],
    READ_LIST,
  ),
  CLIENT_USER: expand(
    ["EXTERNAL_ACCOUNT", "CAMPAIGN_OP", "SEARCH_CAMPAIGN_DRAFT", "DISPLAY_CAMPAIGN_DRAFT", "PERFORMANCE_MAX_CAMPAIGN_DRAFT"],
    READ_LIST,
  ),
  CLIENT_VIEWER: expand(
    ["EXTERNAL_ACCOUNT", "CAMPAIGN_OP", "SEARCH_CAMPAIGN_DRAFT", "DISPLAY_CAMPAIGN_DRAFT", "PERFORMANCE_MAX_CAMPAIGN_DRAFT"],
    READ_LIST,
  ),
};

export function buildRolePermissionRows(): Array<{
  role: MembershipRole;
  resource: PermissionResource;
  action: PermissionAction;
}> {
  const rows: Array<{ role: MembershipRole; resource: PermissionResource; action: PermissionAction }> =
    [];
  const seen = new Set<string>();
  for (const [role, grants] of Object.entries(ROLE_GRANTS) as Array<
    [MembershipRole, Array<{ resource: PermissionResource; action: PermissionAction }>]
  >) {
    for (const grant of grants) {
      const key = `${role}:${grant.resource}:${grant.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ role, resource: grant.resource, action: grant.action });
    }
  }
  return rows;
}

export function roleHasPermission(
  role: MembershipRole,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return ROLE_GRANTS[role].some((grant) => grant.resource === resource && grant.action === action);
}

export function buildClientRolePermissionRows(): Array<{
  role: ClientMemberRole;
  resource: PermissionResource;
  action: PermissionAction;
}> {
  const rows: Array<{
    role: ClientMemberRole;
    resource: PermissionResource;
    action: PermissionAction;
  }> = [];
  const seen = new Set<string>();
  for (const [role, grants] of Object.entries(CLIENT_ROLE_GRANTS) as Array<
    [ClientMemberRole, Array<{ resource: PermissionResource; action: PermissionAction }>]
  >) {
    for (const grant of grants) {
      const key = `${role}:${grant.resource}:${grant.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ role, resource: grant.resource, action: grant.action });
    }
  }
  return rows;
}

export function clientRoleHasPermission(
  role: ClientMemberRole,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return CLIENT_ROLE_GRANTS[role].some(
    (grant) => grant.resource === resource && grant.action === action,
  );
}
