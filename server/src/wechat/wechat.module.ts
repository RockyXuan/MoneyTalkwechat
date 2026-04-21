import { Module } from '@nestjs/common'
import { WechatController } from './wechat.controller'
import { WechatService } from './wechat.service'
import { AiModule } from '@/ai/ai.module'

@Module({
  imports: [AiModule],
  controllers: [WechatController],
  providers: [WechatService],
  exports: [WechatService],
})
export class WechatModule {}
