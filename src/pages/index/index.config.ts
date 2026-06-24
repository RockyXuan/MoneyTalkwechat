export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '记一笔', usingComponents: {} })
  : { navigationBarTitleText: '记一笔', usingComponents: {} }
