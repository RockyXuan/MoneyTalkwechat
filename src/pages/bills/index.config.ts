export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '账单' })
  : { navigationBarTitleText: '账单' }
