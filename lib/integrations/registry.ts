/**
 * Every provider the Integrations hub offers, described as data. Imported by
 * the admin UI (client side) and by the server, so it holds no secrets and no
 * server-only imports.
 *
 * `kind`:
 *  - "connection": stored as a TenantIntegration row (one, or several when
 *    `multiple` is set — alert channels and SSO connections);
 *  - "oauth": connected by sending the admin through the provider's consent
 *    screen (Google Calendar);
 *  - "info": guidance only, nothing stored (Zapier/Make/n8n, calendar feeds).
 */

export type IntegrationCategory = "alerts" | "automation" | "calendar" | "sso";

export type ProviderField = {
  key: string;
  label: string;
  type: "text" | "url" | "secret" | "toggle" | "select" | "domains" | "events";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
};

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  category: IntegrationCategory;
  kind: "connection" | "oauth" | "info";
  multiple?: boolean;
  description: string;
  docsUrl?: string;
  /** Short, ordered set-up instructions. "{redirectUri}" is replaced in the UI. */
  steps: string[];
  fields: ProviderField[];
};

export const ALERT_PROVIDERS = ["slack", "discord", "teams", "google_chat"] as const;
export type AlertProvider = (typeof ALERT_PROVIDERS)[number];

export const SSO_PROVIDERS = ["oidc_google", "oidc_entra", "oidc_generic"] as const;
export type SsoProvider = (typeof SSO_PROVIDERS)[number];

export const MEETING_PROVIDERS = ["zoom", "google_calendar"] as const;
export type MeetingProvider = (typeof MEETING_PROVIDERS)[number];

export type ProviderId = AlertProvider | SsoProvider | MeetingProvider | "automation" | "ics";

export const CATEGORY_LABELS: Record<IntegrationCategory, { title: string; blurb: string }> = {
  alerts: { title: "Team alerts", blurb: "Post a short message to your team's chat when something happens in the academy." },
  automation: { title: "Automation", blurb: "Connect the academy to thousands of other apps without writing code." },
  calendar: { title: "Calendar & meetings", blurb: "Put sessions and exams in people's calendars, and give live sessions a meeting link automatically." },
  sso: { title: "Single sign-on", blurb: "Let learners and staff sign in with the accounts your organisation already uses." },
};

const ALERT_FIELDS = (placeholder: string, hint: string): ProviderField[] => [
  { key: "name", label: "Channel name", type: "text", required: true, placeholder: "#academy-alerts", hint: "Only for you, to tell channels apart." },
  { key: "webhookUrl", label: "Incoming webhook URL", type: "secret", required: true, placeholder, hint },
  { key: "events", label: "Send these events", type: "events", required: true },
];

const SSO_COMMON: ProviderField[] = [
  { key: "clientId", label: "Client ID", type: "text", required: true },
  { key: "clientSecret", label: "Client secret", type: "secret", required: true },
  {
    key: "audience",
    label: "Who can use it",
    type: "select",
    required: true,
    options: [
      { value: "learners", label: "Learners" },
      { value: "staff", label: "Staff" },
      { value: "both", label: "Learners and staff" },
    ],
  },
  { key: "allowedDomains", label: "Allowed email domains", type: "domains", placeholder: "school.edu, staff.school.edu", hint: "Leave empty to accept any verified address the provider vouches for." },
  { key: "jit", label: "Create learner accounts on first sign-in", type: "toggle", hint: "Off: only learners who already have an account can sign in. Staff are never created this way; they must be invited first." },
  { key: "buttonLabel", label: "Button label", type: "text", placeholder: "Sign in with Google" },
];

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "slack",
    name: "Slack",
    category: "alerts",
    kind: "connection",
    multiple: true,
    description: "Post alerts to a Slack channel.",
    docsUrl: "https://api.slack.com/messaging/webhooks",
    steps: [
      "In Slack, open api.slack.com/apps and create an app (From scratch) in your workspace.",
      "Under Incoming Webhooks, switch them on and click Add New Webhook to Workspace.",
      "Pick the channel and copy the URL that starts with https://hooks.slack.com/services/.",
    ],
    fields: ALERT_FIELDS("https://hooks.slack.com/services/…", "Starts with https://hooks.slack.com/"),
  },
  {
    id: "discord",
    name: "Discord",
    category: "alerts",
    kind: "connection",
    multiple: true,
    description: "Post alerts to a Discord channel.",
    docsUrl: "https://support.discord.com/hc/en-us/articles/228383668",
    steps: [
      "In Discord, open the channel's settings → Integrations → Webhooks.",
      "Click New Webhook, name it, then Copy Webhook URL.",
    ],
    fields: ALERT_FIELDS("https://discord.com/api/webhooks/…", "Starts with https://discord.com/api/webhooks/"),
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    category: "alerts",
    kind: "connection",
    multiple: true,
    description: "Post alert cards to a Teams channel.",
    docsUrl: "https://support.microsoft.com/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498",
    steps: [
      "In Teams, open the channel's ••• menu → Workflows.",
      "Choose “Post to a channel when a webhook request is received”, finish the steps and copy the URL it gives you.",
      "A classic Incoming Webhook connector URL (…webhook.office.com) works too.",
    ],
    fields: ALERT_FIELDS("https://….logic.azure.com/workflows/…", "A Teams Workflows URL, or a classic …webhook.office.com URL"),
  },
  {
    id: "google_chat",
    name: "Google Chat",
    category: "alerts",
    kind: "connection",
    multiple: true,
    description: "Post alerts to a Google Chat space.",
    docsUrl: "https://developers.google.com/workspace/chat/quickstart/webhooks",
    steps: [
      "In Google Chat, open the space → Apps & integrations → Webhooks.",
      "Add a webhook, name it, and copy the URL that starts with https://chat.googleapis.com/.",
    ],
    fields: ALERT_FIELDS("https://chat.googleapis.com/v1/spaces/…", "Starts with https://chat.googleapis.com/"),
  },
  {
    id: "automation",
    name: "Zapier, Make & n8n",
    category: "automation",
    kind: "info",
    description: "Trigger zaps and scenarios from academy events, and create learners or enrolments from other apps.",
    docsUrl: "/admin/developers",
    steps: [
      "Create an API key in Developers → API keys, with the scopes the automation needs.",
      "Triggers: add a webhook (Developers → Webhooks) pointing at the “Catch hook” URL from Zapier, Make or n8n — or let the tool subscribe itself with REST hooks (POST /api/v1/webhooks).",
      "Actions: use the tool's HTTP / Webhooks step to call the REST API with the key as a Bearer token.",
    ],
    fields: [],
  },
  {
    id: "ics",
    name: "Calendar feeds",
    category: "calendar",
    kind: "info",
    description: "A private subscription link for Google Calendar, Apple Calendar or Outlook. Works without any account connection.",
    steps: [
      "Learners: Calendar → Subscribe to my calendar.",
      "Staff: create your own link below. It lists every event and published exam in the academy.",
      "Paste the link into Google Calendar (Other calendars → From URL), Apple Calendar (File → New Calendar Subscription) or Outlook (Add calendar → Subscribe from web).",
    ],
    fields: [],
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "calendar",
    kind: "connection",
    description: "Give live sessions a Zoom meeting automatically.",
    docsUrl: "https://developers.zoom.us/docs/internal-apps/s2s-oauth/",
    steps: [
      "Sign in to marketplace.zoom.us with an admin account → Develop → Build App → Server-to-Server OAuth App.",
      "Copy the Account ID, Client ID and Client secret from App credentials.",
      "Under Scopes add meeting:write:meeting:admin (or meeting:write:admin) and user:read:user:admin (or user:read:admin), then Activate the app.",
    ],
    fields: [
      { key: "accountId", label: "Account ID", type: "text", required: true },
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
      { key: "autoCreate", label: "Auto-create Zoom meetings for live sessions", type: "toggle", hint: "A live session saved without a link gets a Zoom meeting, and its join link." },
    ],
  },
  {
    id: "google_calendar",
    name: "Google Calendar & Meet",
    category: "calendar",
    kind: "oauth",
    description: "Push live sessions to your Google Calendar with a Meet link.",
    docsUrl: "https://developers.google.com/calendar/api/guides/overview",
    steps: [
      "Click Connect and sign in with the Google account whose calendar should hold the sessions.",
      "Allow access to calendar events. You can disconnect at any time; access is revoked at Google too.",
    ],
    fields: [
      { key: "autoCreate", label: "Add live sessions to Google Calendar with a Meet link", type: "toggle", hint: "A live session saved without a link gets a calendar event with a Google Meet link." },
    ],
  },
  {
    id: "oidc_google",
    name: "Google Workspace",
    category: "sso",
    kind: "connection",
    multiple: true,
    description: "Sign in with Google accounts from your Workspace domain.",
    docsUrl: "https://developers.google.com/identity/openid-connect/openid-connect",
    steps: [
      "In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID of type Web application.",
      "Under Authorised redirect URIs add: {redirectUri}",
      "On the OAuth consent screen choose Internal (Workspace only), then paste the client ID and secret here.",
      "Set Allowed email domains to your Workspace domain so personal Gmail accounts cannot sign in.",
    ],
    fields: [{ key: "name", label: "Connection name", type: "text", placeholder: "Google Workspace" }, ...SSO_COMMON],
  },
  {
    id: "oidc_entra",
    name: "Microsoft Entra ID",
    category: "sso",
    kind: "connection",
    multiple: true,
    description: "Sign in with Microsoft 365 / Entra ID work accounts.",
    docsUrl: "https://learn.microsoft.com/entra/identity-platform/quickstart-register-app",
    steps: [
      "In the Entra admin centre → App registrations → New registration. Supported account types: this organisational directory only.",
      "Redirect URI: platform Web, value {redirectUri}",
      "Certificates & secrets → New client secret; copy its Value. Copy the Application (client) ID and Directory (tenant) ID from Overview.",
      "API permissions: Microsoft Graph delegated openid, email and profile (granted by default).",
    ],
    fields: [
      { key: "name", label: "Connection name", type: "text", placeholder: "Microsoft" },
      { key: "directoryId", label: "Directory (tenant) ID", type: "text", required: true, placeholder: "00000000-0000-0000-0000-000000000000", hint: "Your directory's ID or primary domain. Not “common”." },
      ...SSO_COMMON,
    ],
  },
  {
    id: "oidc_generic",
    name: "Other OpenID Connect",
    category: "sso",
    kind: "connection",
    multiple: true,
    description: "Okta, Auth0, Keycloak, JumpCloud or any OpenID Connect provider.",
    docsUrl: "https://openid.net/specs/openid-connect-core-1_0.html",
    steps: [
      "In your identity provider, create a Web / confidential OIDC application using the authorization code flow.",
      "Set its sign-in redirect URI to: {redirectUri}",
      "Paste the issuer URL (we read its /.well-known/openid-configuration), client ID and secret here.",
    ],
    fields: [
      { key: "name", label: "Connection name", type: "text", required: true, placeholder: "Okta" },
      { key: "issuer", label: "Issuer URL", type: "url", required: true, placeholder: "https://yourorg.okta.com" },
      ...SSO_COMMON,
    ],
  },
];

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isAlertProvider(id: string): id is AlertProvider {
  return (ALERT_PROVIDERS as readonly string[]).includes(id);
}

export function isSsoProvider(id: string): id is SsoProvider {
  return (SSO_PROVIDERS as readonly string[]).includes(id);
}

export function isMeetingProvider(id: string): id is MeetingProvider {
  return (MEETING_PROVIDERS as readonly string[]).includes(id);
}

/** The webhook catalogue's events an alert channel may pick by default. */
export const DEFAULT_ALERT_EVENTS = ["enrollment.created", "payment.succeeded", "exam.integrity.flagged", "exam.result.released"];
