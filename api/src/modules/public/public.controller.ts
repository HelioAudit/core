import { Body, Controller, Logger, Post } from "@nestjs/common";

import { SubmitSupportRequestDto } from "./dto/submit-support-request.dto";
import { ZohoDeskService } from "./services/zoho-desk.service";

@Controller("public")
export class PublicController {
  private readonly logger = new Logger(PublicController.name);

  constructor(private readonly zohoDeskService: ZohoDeskService) {}

  /**
   * Submit a support request to Zoho Desk.
   */
  @Post("support")
  async submitSupportRequest(
    @Body() submitSupportRequestDto: SubmitSupportRequestDto,
  ): Promise<{ message: string; data: null }> {
    try {
      return await this.zohoDeskService.submitSupportRequest(
        submitSupportRequestDto,
      );
    } catch (error) {
      this.logger.error(
        `Submit support request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
