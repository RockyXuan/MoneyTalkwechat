import { Controller, Post, HttpCode, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AsrService } from './asr.service'

@Controller('asr')
export class AsrController {
  constructor(private readonly asrService: AsrService) {}

  @Post('recognize')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('audio'))
  async recognize(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { user_id?: string },
  ) {
    console.log('POST /api/asr/recognize', {
      userId: body.user_id,
      fileExists: !!file,
      fileSize: file?.size,
      mimetype: file?.mimetype,
    })

    if (!file) {
      throw new BadRequestException('音频文件为空')
    }

    let audioBuffer: Buffer
    if (file.buffer) {
      audioBuffer = file.buffer
    } else if (file.path) {
      const fs = await import('fs/promises')
      audioBuffer = await fs.readFile(file.path)
    } else {
      throw new BadRequestException('无法读取音频数据')
    }

    console.log('音频数据长度:', audioBuffer.length)
    const result = await this.asrService.recognize(audioBuffer)
    return { code: 200, msg: 'success', data: result }
  }
}
