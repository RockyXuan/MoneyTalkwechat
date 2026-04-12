import { Injectable } from '@nestjs/common'
import { ASRClient, Config } from 'coze-coding-dev-sdk'

@Injectable()
export class AsrService {
  private asrClient: ASRClient

  constructor() {
    const config = new Config()
    this.asrClient = new ASRClient(config)
  }

  async recognize(audioBuffer: Buffer): Promise<{ text: string }> {
    console.log('ASR recognize - audio buffer length:', audioBuffer.length)

    try {
      const base64Data = audioBuffer.toString('base64')
      console.log('ASR - base64 length:', base64Data.length)

      const result = await this.asrClient.recognize({ base64Data })
      console.log('ASR result:', JSON.stringify(result))
      const text = result?.text || ''
      return { text }
    } catch (err) {
      console.error('ASR recognize error:', err)
      throw new Error('语音识别失败')
    }
  }
}
