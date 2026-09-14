> 历史归档，2026-09-14 起不再作为当前需求或执行规范。旧 iOS/微信路线与 GLM5.2 微信同步任务已作废。本文仅供理解旧代码/设计，不自动恢复其中的命令、部署步骤或 UI 要求。当前方向见 [Mac HTML/Cloudflare 交接](mac-html-cloudflare-handoff.md)。

# WeChat Voice Inbox Manual Test Fixtures

Use these XML bodies against `POST /api/wechat/webhook` after creating a row in `wechat_bindings` for `wechat_openid = test-openid`.

## Text Message

```xml
<xml>
  <ToUserName><![CDATA[test-dev]]></ToUserName>
  <FromUserName><![CDATA[test-openid]]></FromUserName>
  <CreateTime>1717200000</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[午饭 35 元]]></Content>
  <MsgId>10001</MsgId>
</xml>
```

## Voice Message With Recognition

```xml
<xml>
  <ToUserName><![CDATA[test-dev]]></ToUserName>
  <FromUserName><![CDATA[test-openid]]></FromUserName>
  <CreateTime>1717200001</CreateTime>
  <MsgType><![CDATA[voice]]></MsgType>
  <MediaId><![CDATA[test-media-id]]></MediaId>
  <Format><![CDATA[amr]]></Format>
  <Recognition><![CDATA[星巴克 28 元]]></Recognition>
  <MsgId>10002</MsgId>
</xml>
```

## Voice Message Without Recognition

```xml
<xml>
  <ToUserName><![CDATA[test-dev]]></ToUserName>
  <FromUserName><![CDATA[test-openid]]></FromUserName>
  <CreateTime>1717200002</CreateTime>
  <MsgType><![CDATA[voice]]></MsgType>
  <MediaId><![CDATA[test-media-id-no-recognition]]></MediaId>
  <Format><![CDATA[amr]]></Format>
  <MsgId>10003</MsgId>
</xml>
```

Expected behavior: all three requests return a valid WeChat XML reply; the voice requests create pending records with `source_message_type = voice`, preserve `wechat_media_id`, and attach `media_object_key` when TOS/S3 is configured and media download succeeds.
