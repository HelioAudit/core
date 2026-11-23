import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

import {
  ZOHO_TICKET_CATEGORIES,
  ZOHO_TICKET_TYPE_CONFIG,
} from "../constants/zoho-ticket.constants";
import { SubmitSupportRequestDto } from "../dto/submit-support-request.dto";
import {
  ZohoDeskContactPayload,
  ZohoDeskCreateTicketPayload,
  ZohoDeskTicketResponse,
  ZohoTokenResponse,
} from "../interfaces/zoho-desk.interface";
import { buildZohoTicketDescription } from "../utils/zoho-ticket-template.util";

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

/**
 * Format the error message for the Zoho Desk API request.
 */
function formatZohoRequestError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const responseBody =
    typeof error.response?.data === "string"
      ? error.response.data
      : JSON.stringify(error.response?.data ?? {});

  return `${error.message} status=${error.response?.status ?? "n/a"} body=${responseBody}`;
}

@Injectable()
export class ZohoDeskService {
  private readonly logger = new Logger(ZohoDeskService.name);

  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Submit a support request to Zoho Desk.
   */
  async submitSupportRequest(
    input: SubmitSupportRequestDto,
  ): Promise<{ message: string; data: null }> {
    const brandName = this.getBrandName();

    return this.createTicket(
      {
        subject: ZOHO_TICKET_TYPE_CONFIG.support.subject,
        departmentId:
          this.configService.getOrThrow<string>("ZOHO_DEPARTMENT_ID"),
        description: buildZohoTicketDescription("support", input, brandName),
        email: input.email.trim(),
        channel: "Web",
        status: "Open",
        category: ZOHO_TICKET_CATEGORIES.SUPPORT,
        subCategory: input.topic,
        contact: this.buildContactFromName(input.name, input.email),
      },
      "Support request submitted successfully",
      `support ticket for ${input.email}`,
    );
  }

  /**
   * Create a ticket in Zoho Desk.
   */
  private async createTicket(
    payload: ZohoDeskCreateTicketPayload,
    successMessage: string,
    logContext: string,
  ): Promise<{ message: string; data: null }> {
    try {
      const accessToken = await this.getAccessToken();
      const deskBaseUrl =
        this.configService.getOrThrow<string>("ZOHO_DESK_BASE_URL");
      const organizationId = this.configService.getOrThrow<string>(
        "ZOHO_ORGANIZATION_ID",
      );

      const { data: ticket } = await axios.post<ZohoDeskTicketResponse>(
        `${deskBaseUrl}/tickets`,
        payload,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            orgId: organizationId,
            "Content-Type": "application/json",
          },
        },
      );

      if (!ticket.id) {
        throw new BadGatewayException(
          "Unable to submit request. Please try again later.",
        );
      }

      this.logger.log(
        `Created Zoho Desk ${logContext}: ${ticket.ticketNumber ?? ticket.id}`,
      );

      return {
        message: successMessage,
        data: null,
      };
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      this.logger.error(
        `Zoho Desk ticket creation failed (${logContext}): ${formatZohoRequestError(error)}`,
      );

      throw new BadGatewayException(
        "Unable to submit request. Please try again later.",
      );
    }
  }

  /**
   * Get the brand name from the configuration.
   */
  private getBrandName(): string {
    return this.configService.get<string>("BREVO_FROM_NAME") ?? "Helioaudit";
  }

  /**
   * Build a contact payload from a name and email.
   */
  private buildContactFromName(
    name: string,
    email: string,
  ): ZohoDeskContactPayload {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const spaceIndex = trimmedName.indexOf(" ");

    if (spaceIndex === -1) {
      return { email: trimmedEmail, lastName: trimmedName };
    }

    return {
      email: trimmedEmail,
      firstName: trimmedName.slice(0, spaceIndex),
      lastName: trimmedName.slice(spaceIndex + 1).trim() || trimmedName,
    };
  }

  /**
   * Get an access token from Zoho Desk.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    if (
      this.accessToken &&
      now < this.accessTokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS
    ) {
      return this.accessToken;
    }

    const accountsBaseUrl = this.configService.getOrThrow<string>(
      "ZOHO_ACCOUNTS_BASE_URL",
    );
    const clientId = this.configService.getOrThrow<string>("ZOHO_CLIENT_ID");
    const clientSecret =
      this.configService.getOrThrow<string>("ZOHO_CLIENT_SECRET");
    const refreshToken =
      this.configService.getOrThrow<string>("ZOHO_REFRESH_TOKEN");

    try {
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });

      const { data } = await axios.post<ZohoTokenResponse>(
        `${accountsBaseUrl}/oauth/v2/token`,
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      if (!data.access_token || !data.expires_in) {
        this.logger.error(
          `Zoho OAuth token refresh rejected: ${JSON.stringify(data)}`,
        );

        throw new ServiceUnavailableException(
          "Support service is temporarily unavailable. Please try again later.",
        );
      }

      this.accessToken = data.access_token;
      this.accessTokenExpiresAt = Date.now() + data.expires_in * 1000;

      return this.accessToken;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        `Zoho OAuth token refresh failed: ${formatZohoRequestError(error)}`,
      );

      throw new ServiceUnavailableException(
        "Support service is temporarily unavailable. Please try again later.",
      );
    }
  }
}
