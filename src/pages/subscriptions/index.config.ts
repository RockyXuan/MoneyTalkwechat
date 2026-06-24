export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '订阅', usingComponents: {} })
  : { navigationBarTitleText: '订阅', usingComponents: {} }
