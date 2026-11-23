import type { SubmitSupportRequestDto } from "../dto/submit-support-request.dto";

export function buildZohoTicketDescription(
  type: "support" | "service_request",
  data: SubmitSupportRequestDto,
  brandName: string,
): string {
  const baseInfo = `
**Source:** ${brandName} Website
**Name:** ${data.name}
**Email:** ${data.email}
**Topic:** ${data.topic}

**Message:**
${data.message}
`;

  return baseInfo.trim();
}
