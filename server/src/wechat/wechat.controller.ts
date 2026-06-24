import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from '@nestjs/common'
import { WechatService } from './wechat.service'
import type { Request, Response } from 'express'

@Controller('wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  /**
   * WeChat webhook verification (GET)
   * WeChat sends signature, timestamp, nonce, echostr
   */
  @Get('webhook')
  handleVerification(
    @Query('signature') signature: string,
    @Query('timestamp') timestamp: string,
    @Query('nonce') nonce: string,
    @Query('echostr') echostr: string,
  ): string {
    console.log('WechatController.handleVerification:', { signature, timestamp, nonce, echostr })
    const valid = this.wechatService.verifySignature(signature, timestamp, nonce)
    if (valid) {
      console.log('WeChat webhook verification passed')
      return echostr
    }
    console.error('WeChat webhook verification failed')
    return ''
  }

  /**
   * WeChat webhook message receiving (POST)
   * WeChat sends XML body
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleMessage(@Req() req: Request): Promise<string> {
    // Get raw body as string
    let xmlBody = ''
    if (typeof req.body === 'string') {
      xmlBody = req.body
    } else if (req.body && typeof req.body === 'object') {
      // If body was parsed as JSON by some middleware
      xmlBody = JSON.stringify(req.body)
    } else if (Buffer.isBuffer(req.body)) {
      xmlBody = req.body.toString('utf-8')
    }

    // Fallback: read from raw body chunks if empty
    if (!xmlBody && req.readable) {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      }
      xmlBody = Buffer.concat(chunks).toString('utf-8')
    }

    console.log('WechatController.handleMessage raw body length:', xmlBody.length)

    try {
      return await this.wechatService.handleMessage(xmlBody)
    } catch (err) {
      console.error('WechatController.handleMessage error:', err)
      // Must return a valid XML response even on error
      const msg = this.wechatService.parseXml(xmlBody)
      return this.wechatService.buildTextReply(
        msg['FromUserName'] || '',
        msg['ToUserName'] || '',
        '处理失败，请稍后重试',
      )
    }
  }

  /**
   * Generate binding code for a user
   */
  @Post('binding-code')
  async generateBindingCode(@Body() body: { user_id: string }): Promise<{ code: number; msg: string; data: { binding_code?: string; bound?: boolean } }> {
    const result = await this.wechatService.generateBindingCode(body.user_id)
    if (result === 'ALREADY_BOUND') {
      return { code: 200, msg: '已绑定', data: { bound: true } }
    }
    return { code: 200, msg: '绑定码已生成', data: { binding_code: result, bound: false } }
  }

  /**
   * Get binding status for a user
   */
  @Get('binding-status')
  async getBindingStatus(@Query('user_id') userId: string): Promise<{ code: number; msg: string; data: { bound: boolean } }> {
    const result = await this.wechatService.getBindingStatus(userId)
    return { code: 200, msg: 'ok', data: result }
  }

  /**
   * Get pending records for a user
   */
  @Get('pending-records')
  async getPendingRecords(@Query('user_id') userId: string): Promise<{ code: number; msg: string; data: any[] }> {
    const records = await this.wechatService.getPendingRecords(userId)
    return { code: 200, msg: 'ok', data: records }
  }

  /**
   * Stream a pending record's original voice media after user ownership check
   */
  @Get('pending-records/:id/media')
  async streamPendingRecordMedia(
    @Param('id') id: string,
    @Query('user_id') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const media = await this.wechatService.getPendingRecordMedia(id, userId)
      res.setHeader('Content-Type', media.contentType)
      res.setHeader('Cache-Control', 'private, max-age=300')
      if (media.contentLength) {
        res.setHeader('Content-Length', String(media.contentLength))
      }
      media.stream.on('error', error => {
        console.error('WechatController.streamPendingRecordMedia stream error:', error)
        if (!res.headersSent) {
          res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 500, msg: '语音读取失败' })
        } else {
          res.end()
        }
      })
      media.stream.pipe(res)
    } catch (error) {
      console.error('WechatController.streamPendingRecordMedia error:', error)
      const msg = error instanceof Error ? error.message : '语音不存在'
      res.status(HttpStatus.NOT_FOUND).json({ code: 404, msg })
    }
  }

  /**
   * Confirm a pending record
   */
  @Post('pending-records/:id/confirm')
  async confirmPendingRecord(
    @Param('id') id: string,
    @Body() body: { user_id: string },
  ): Promise<{ code: number; msg: string; data: any }> {
    const record = await this.wechatService.confirmPendingRecord(id, body.user_id)
    return { code: 200, msg: '已确认', data: record }
  }

  /**
   * Reject a pending record
   */
  @Post('pending-records/:id/reject')
  async rejectPendingRecord(
    @Param('id') id: string,
    @Body() body: { user_id: string },
  ): Promise<{ code: number; msg: string }> {
    await this.wechatService.rejectPendingRecord(id, body.user_id)
    return { code: 200, msg: '已拒绝' }
  }

  /**
   * Get pending record count for a user
   */
  @Get('pending-count')
  async getPendingCount(@Query('user_id') userId: string): Promise<{ code: number; msg: string; data: { count: number } }> {
    const count = await this.wechatService.getPendingCount(userId)
    return { code: 200, msg: 'ok', data: { count } }
  }

  /**
   * Save parsed expense/subscription to inbox from mini program
   */
  @Post('save-to-inbox')
  async saveToInbox(
    @Body() body: { user_id: string; raw_text: string; record_type?: 'expense' | 'subscription'; parsed_data: any },
  ): Promise<{ code: number; msg: string }> {
    await this.wechatService.createPendingRecord(
      body.user_id,
      body.raw_text,
      body.record_type || 'expense',
      body.parsed_data || {},
      'mini_program',
    )
    return { code: 200, msg: '已保存到收集箱' }
  }
}
