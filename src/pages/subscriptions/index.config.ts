export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '订阅' })
  : { navigationBarTitleText: '订阅' }
