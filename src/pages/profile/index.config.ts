export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '我的', usingComponents: {} })
  : { navigationBarTitleText: '我的', usingComponents: {} }
