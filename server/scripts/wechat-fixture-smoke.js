const assert = require('assert/strict')

process.env.COZE_SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.COZE_SUPABASE_ANON_KEY ||= 'test-anon-key'

const { WechatService } = require('../dist/wechat/wechat.service')

const makeXml = body => `<xml>
  <ToUserName><![CDATA[test-dev]]></ToUserName>
  <FromUserName><![CDATA[test-openid]]></FromUserName>
  <CreateTime>1717200000</CreateTime>
  ${body}
</xml>`

async function main() {
  const pendingWrites = []
  const downloadedMediaIds = []
  const uploadedMediaIds = []
  const asrBuffers = []

  const aiService = {
    async parseExpense(text) {
      const amount = text.includes('28') ? 28 : 35
      return [{ amount, category: '餐饮', note: text, expense_date: '2026-06-01', confidence: 0.9 }]
    },
    async parseSubscription() {
      return []
    },
  }
  const asrService = {
    async recognize(buffer) {
      asrBuffers.push(buffer)
      return { text: '咖啡 35 元' }
    },
  }
  const wechatMediaService = {
    async downloadTemporaryMedia(mediaId) {
      downloadedMediaIds.push(mediaId)
      return { buffer: Buffer.from(`voice:${mediaId}`), contentType: 'audio/amr' }
    },
  }
  const tosMediaStorageService = {
    async uploadWechatVoice(input) {
      uploadedMediaIds.push(input.mediaId)
      return {
        objectKey: `wechat-voice/test/${input.mediaId}.amr`,
        contentType: 'audio/amr',
        size: input.buffer.length,
      }
    },
  }

  const service = new WechatService(aiService, asrService, wechatMediaService, tosMediaStorageService)
  service.getBinding = async () => ({ id: 'binding-1', user_id: 'default_user' })
  service.createPendingRecord = async (userId, rawText, recordType, parsedData, source, metadata) => {
    pendingWrites.push({ userId, rawText, recordType, parsedData, source, metadata })
  }

  const textReply = await service.handleMessage(makeXml(`
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[午饭 35 元]]></Content>
  <MsgId>10001</MsgId>`))

  assert.match(textReply, /已记录 1 笔支出/)
  assert.equal(pendingWrites[0].rawText, '午饭 35 元')
  assert.equal(pendingWrites[0].metadata.source_message_type, 'text')
  assert.equal(pendingWrites[0].metadata.transcription_source, 'text')

  const voiceRecognitionReply = await service.handleMessage(makeXml(`
  <MsgType><![CDATA[voice]]></MsgType>
  <MediaId><![CDATA[media-recognition]]></MediaId>
  <Format><![CDATA[amr]]></Format>
  <Recognition><![CDATA[星巴克 28 元]]></Recognition>
  <MsgId>10002</MsgId>`))

  assert.match(voiceRecognitionReply, /已记录 1 笔支出/)
  assert.equal(pendingWrites[1].rawText, '星巴克 28 元')
  assert.equal(pendingWrites[1].metadata.source_message_type, 'voice')
  assert.equal(pendingWrites[1].metadata.wechat_media_id, 'media-recognition')
  assert.equal(pendingWrites[1].metadata.media_object_key, 'wechat-voice/test/media-recognition.amr')
  assert.equal(pendingWrites[1].metadata.transcription_source, 'wechat_recognition')

  const voiceAsrReply = await service.handleMessage(makeXml(`
  <MsgType><![CDATA[voice]]></MsgType>
  <MediaId><![CDATA[media-asr]]></MediaId>
  <Format><![CDATA[amr]]></Format>
  <MsgId>10003</MsgId>`))

  assert.match(voiceAsrReply, /已记录 1 笔支出/)
  assert.equal(pendingWrites[2].rawText, '咖啡 35 元')
  assert.equal(pendingWrites[2].metadata.wechat_media_id, 'media-asr')
  assert.equal(pendingWrites[2].metadata.transcription_source, 'asr')
  assert.equal(asrBuffers.length, 1)
  assert.deepEqual(downloadedMediaIds, ['media-recognition', 'media-asr'])
  assert.deepEqual(uploadedMediaIds, ['media-recognition', 'media-asr'])

  console.log('wechat fixture smoke tests passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
