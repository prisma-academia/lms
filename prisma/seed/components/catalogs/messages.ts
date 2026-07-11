export type MessageSeed = {
  subject: string;
  body: string;
  category: "MESSAGE" | "ANNOUNCEMENT" | "REMINDER";
  read: boolean;
  daysAgo: number;
};

export const MESSAGE_CATALOG: MessageSeed[] = [
  {
    subject: "Welcome to Greenfield Academy Lagos",
    body: "Hi Rashida,\n\nWelcome to the 2026 WAEC cohort. Your courses are ready — start with Biology for WAEC and keep your streak going.\n\n— Ada Okonkwo, Academy Director",
    category: "MESSAGE",
    read: false,
    daysAgo: 5,
  },
  {
    subject: "Reminder: JavaScript assignment due tomorrow",
    body: "Your phone number formatting exercise is due tomorrow at 11:59 PM WAT. Submit via the Assignments page.",
    category: "REMINDER",
    read: true,
    daysAgo: 2,
  },
  {
    subject: "WAEC exam tips from last year's top scorer",
    body: "Read through these 10 tips for Paper 2 Biology — focus on labelled diagrams and concise definitions.",
    category: "ANNOUNCEMENT",
    read: false,
    daysAgo: 1,
  },
];

export type NotificationSeed = {
  title: string;
  body: string;
  category: "MESSAGE" | "ANNOUNCEMENT" | "REMINDER";
  read: boolean;
  daysAgo: number;
};

export const NOTIFICATION_CATALOG: NotificationSeed[] = [
  {
    title: "Grade posted: Instagram promo critique",
    body: "You scored 97/100 on your graphic design peer review.",
    category: "ANNOUNCEMENT",
    read: true,
    daysAgo: 4,
  },
  {
    title: "New assignment: Lab report",
    body: "Biology for WAEC — osmosis lab report due in 2 days.",
    category: "REMINDER",
    read: false,
    daysAgo: 1,
  },
  {
    title: "Webinar tomorrow: WAEC Biology revision",
    body: "Join at 4:00 PM WAT — link in Calendar.",
    category: "REMINDER",
    read: false,
    daysAgo: 0,
  },
  {
    title: "Certificate earned!",
    body: "You completed Graphic Design for Social Media. View your certificate in Certificates.",
    category: "ANNOUNCEMENT",
    read: true,
    daysAgo: 5,
  },
  {
    title: "Unread message from academy",
    body: "You have a new welcome message in your inbox.",
    category: "MESSAGE",
    read: false,
    daysAgo: 5,
  },
];
