export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '账单', usingComponents: {} })
  : { navigationBarTitleText: '账单', usingComponents: {} }
