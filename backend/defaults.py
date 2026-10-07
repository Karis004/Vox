from backend.models import BriefingConfig
from backend.news import ACTUARIAL_PROMPT, FINANCIAL_PROMPT
from backend.speech import DEFAULT_ALIASES


DEFAULT_CONFIG = BriefingConfig.model_validate(
    {
        "title": "工作日晨间播报",
        "separator": "\n",
        "blocks": [
            {
                "id": "greeting",
                "type": "text",
                "name": "开场",
                "config": {
                    "content": "早上好，今天是 {{date}}，{{weekday}}。",
                },
            },
            {
                "id": "weather-hong-kong",
                "type": "weather",
                "name": "香港天气",
                "config": {
                    "city": "香港",
                    "template": "{{city}}现在{{condition}}，{{temperature}}摄氏度，体感{{apparent_temperature}}摄氏度，今天最高{{max_temperature}}度、最低{{min_temperature}}度，降雨概率{{precipitation_probability}}%。",
                },
            },
            {
                "id": "market-watch",
                "type": "stocks",
                "name": "关注股票",
                "config": {
                    "symbols": ["AAPL", "TSLA", "NVDA"],
                    "market_label": "关注的美股",
                    "template": "{{market_label}}{{trend}}。{{items}}。",
                },
                "ai": {
                    "enabled": False,
                    "prompt": "将这些行情整理成一句客观、简洁的中文口播，不要提供投资建议。",
                },
            },
            {
                "id": "closing",
                "type": "text",
                "name": "结束语",
                "config": {"content": "以上是今天的晨间简报，祝你一天顺利。"},
            },
        ],
    }
)


DATE_VARIABLES = [
    {"key": "date", "description": "月日，例如 10月1日"},
    {"key": "year", "description": "年份"},
    {"key": "month", "description": "月份数字"},
    {"key": "day", "description": "日期数字"},
    {"key": "weekday", "description": "星期几"},
    {"key": "time", "description": "当前时间，24 小时制"},
]


MODULE_CATALOG = [
    {
        "type": "news", "name": "金融新闻",
        "description": "真实订阅源与AI筛选：全球或香港前一天的重大财经事件",
        "defaults": {"scope": "global", "count": 2, "prompt": FINANCIAL_PROMPT, "aliases": DEFAULT_ALIASES},
        "variables": DATE_VARIABLES,
    },
    {
        "type": "actuarial", "name": "精算与保险新闻",
        "description": "寿险、资本、监管、再保险及风险模型；不足时明确回顾日期",
        "defaults": {"scope": "global", "count": 2, "prompt": ACTUARIAL_PROMPT, "aliases": DEFAULT_ALIASES},
        "variables": DATE_VARIABLES,
    },
    {
        "type": "text",
        "name": "自由文本",
        "description": "固定文案，支持日期与时间变量",
        "defaults": {"content": "在这里写下要播报的内容。"},
        "variables": DATE_VARIABLES,
    },
    {
        "type": "weather",
        "name": "天气",
        "description": "使用免密钥的 Open-Meteo 获取实时天气",
        "defaults": {
            "city": "上海",
            "template": "{{city}}现在{{condition}}，{{temperature}}摄氏度，今天最高{{max_temperature}}度、最低{{min_temperature}}度。",
        },
        "variables": DATE_VARIABLES + [
            {"key": "city", "description": "匹配到的城市名称"},
            {"key": "country", "description": "国家或地区"},
            {"key": "condition", "description": "天气描述"},
            {"key": "temperature", "description": "当前温度，摄氏度"},
            {"key": "apparent_temperature", "description": "体感温度，摄氏度"},
            {"key": "wind_speed", "description": "当前风速，公里/小时"},
            {"key": "max_temperature", "description": "今日最高温度，摄氏度"},
            {"key": "min_temperature", "description": "今日最低温度，摄氏度"},
            {"key": "precipitation_probability", "description": "今日最高降雨概率，百分数"},
        ],
    },
    {
        "type": "stocks",
        "name": "股票行情",
        "description": "获取股票价格和当日涨跌幅",
        "defaults": {
            "symbols": ["AAPL", "NVDA"],
            "market_label": "关注的股票",
            "template": "{{market_label}}{{trend}}。{{items}}。",
        },
        "variables": DATE_VARIABLES + [
            {"key": "market_label", "description": "设置的市场名称"},
            {"key": "trend", "description": "按平均涨跌幅生成的走势描述"},
            {"key": "items", "description": "全部有效股票的中文行情"},
            {"key": "average_change", "description": "平均涨跌幅，不含百分号"},
            {"key": "count", "description": "成功获取行情的股票数量"},
        ],
    },
    {
        "type": "http",
        "name": "HTTP 数据源",
        "description": "读取任意 JSON API，并将字段编排为文本",
        "defaults": {
            "url": "https://api.example.com/data",
            "path": "",
            "headers": {},
            "template": "{{value}}",
        },
        "variables": DATE_VARIABLES + [
            {"key": "value", "description": "数据路径选中的完整值；测试后会显示更多字段"},
        ],
    },
]
