export const DEFAULT_OWNERS = [
  { id: 'me', name: '我', color_key: 'blue', sort_order: 10 },
  { id: 'wife', name: '老婆', color_key: 'pink', sort_order: 20 },
  { id: 'parents', name: '父母', color_key: 'amber', sort_order: 30 },
  { id: 'kid', name: '孩子', color_key: 'green', sort_order: 40 },
  { id: 'family', name: '全家', color_key: 'purple', sort_order: 50 },
];

export const RECOMMENDED_SUBCATEGORIES = {
  餐饮: ['外卖', '饮料咖啡', '下馆子', '日常买菜', '零食水果', '聚餐请客', '早餐'],
  交通: ['地铁公交', '打车', '加油充电', '停车过路', '高铁机票'],
  购物: ['服饰鞋包', '图书绘本', '家居百货', '个护日化', '数码家电', '玩具手办', '美妆护肤'],
  娱乐: ['电影', '游戏', '会员影音', '演出展览', '桌游密室', '旅行玩乐'],
  住房: ['房租房贷', '水电物业', '宽带话费', '家政维修'],
  医疗: ['保健品', '买药看病', '体检挂号', '运动健身', '保险保障'],
  教育: ['课程培训', '专业书籍', '亲子绘本', '考试认证'],
  生活: ['家庭日用', '理发美容', '快递跑腿', '水电煤气'],
};

export const RECOMMENDED_NEW_MAJORS = [
  {
    id: 'family-care',
    name: '家庭人情',
    type: 'expense',
    color_key: 'red',
    icon: 'gift',
    default_owner_id: 'parents',
    subcategories: ['孝敬父母', '伴侣礼物', '亲子育儿', '红包礼金'],
  },
  {
    id: 'health-care',
    name: '健康保健',
    type: 'expense',
    color_key: 'teal',
    icon: 'circle-plus',
    default_owner_id: 'me',
    subcategories: ['保健品', '体检挂号', '运动健身', '买药看病'],
  },
  {
    id: 'learning-growth',
    name: '学习成长',
    type: 'expense',
    color_key: 'indigo',
    icon: 'graduation-cap',
    default_owner_id: 'me',
    subcategories: ['课程培训', '专业书籍', '效率工具'],
  },
  {
    id: 'pet-care',
    name: '宠物',
    type: 'expense',
    color_key: 'amber',
    icon: 'leaf',
    default_owner_id: 'family',
    subcategories: ['宠物食品', '医疗洗护', '玩具用品'],
  },
];

export const STARTER_PACKS = {
  personal: {
    id: 'personal',
    label: '个人标准包',
    description: '为现有常用大类启用前 4 个高频二级子类，并补充「学习成长」大类',
    majorIds: ['learning-growth'],
    subLimit: 4,
  },
  family: {
    id: 'family',
    label: '家庭精细包',
    description: '启用全部财务常识推荐二级子类，并补充「家庭人情」「健康保健」「学习成长」「宠物」大类',
    majorIds: ['family-care', 'health-care', 'learning-growth', 'pet-care'],
    subLimit: 10,
  },
};

export function recommendedSubcategoriesFor(category) {
  if (!category || category.type !== 'expense') return [];
  const active = new Set(category.subcategories || []);
  const list = RECOMMENDED_SUBCATEGORIES[category.name] || RECOMMENDED_NEW_MAJORS.find(m => m.name === category.name)?.subcategories || [];
  return list.filter(name => !active.has(name));
}
