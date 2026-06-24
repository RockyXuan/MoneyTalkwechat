import { Module } from '@nestjs/common'
import { WechatController } from './wechat.controller'
import { WechatService } from './wechat.service'
import { AiModule } from '@/ai/ai.module'
import { AsrModule } from '@/asr/asr.module'
import { WechatMediaService } from './wechat-media.service'
import { TosMediaStorageService } from './tos-media-storage.service'

@Module({
  imports: [AiModule, AsrModule],
  controllers: [WechatController],
  providers: [WechatService, WechatMediaService, TosMediaStorageService],
  exports: [WechatService],
})
export class WechatModule {}
