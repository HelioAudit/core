export interface ZohoDeskContactPayload {
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface ZohoDeskCreateTicketPayload {
  subject: string;
  departmentId: string;
  description: string;
  email: string;
  channel: string;
  status: string;
  category: string;
  subCategory?: string;
  contact: ZohoDeskContactPayload;
}

export interface ZohoDeskTicketResponse {
  id: string;
  ticketNumber?: string;
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
}
