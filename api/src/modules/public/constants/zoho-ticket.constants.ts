export const ZOHO_TICKET_CATEGORIES = {
  SUPPORT: "Support",
  SERVICE_REQUEST: "Service Request",
} as const;

export const ZOHO_TICKET_TYPE_CONFIG = {
  support: {
    subject: "Website Support Request",
  },
  service_request: {
    subject: "Website Service Request",
  },
} as const;
