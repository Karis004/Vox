"""Readable wording for the letter-only English voice module."""
import re

DEFAULT_ALIASES = """Prudential=PRU
AIA= AIA
AXA=AXA
HSBC=HSBC
PricewaterhouseCoopers=PWC
Ernst & Young=EY
Deloitte=德勤
KPMG=KPMG
Donald Trump=特朗普
Trump=特朗普
Federal Reserve=美联储
Microsoft=MSFT
Apple=苹果
Nvidia=英伟达
Tesla=特斯拉
Google=谷歌
Amazon=亚马逊
BlackRock=贝莱德
Swiss Re=瑞士再保险
Munich Re=慕尼黑再保险"""

SPEECH_RULES = """听众使用只能逐字母读英文的中文语音板。输出简体中文口播，不用英文单词、英文人名、网址、Markdown或表格。
保留听众熟悉的字母简称：AIA、AXA、HSBC、PRU、PWC、EY、KPMG，以及股票代码、IFRS、RBC、SOA、CAS、AI、ETF等；不要强行把AIA改成友邦、HSBC改成汇丰。
Prudential写成PRU；Donald Trump写成特朗普。其他人名用常见中文译名；普通英文术语译成易懂的中文，专业缩写可保留，首次必要时加中文解释。
公司名称优先遵循用户的名称替换表，其次采用常见字母简称或股票代码；不认识的公司不要猜代码，使用常见中文译名。
数字保留准确单位，百分比写成百分之，金额明确货币，正负和涨跌不能颠倒。只输出适合直接朗读的文字。"""


def alias_map(lines: str = DEFAULT_ALIASES) -> dict[str, str]:
    result = {}
    for line in lines.splitlines():
        if not line.strip():
            continue
        if "=" not in line:
            raise ValueError("名称替换表每行需要：原名=播报名称")
        name, spoken = (part.strip() for part in line.split("=", 1))
        if not name or not spoken:
            raise ValueError("名称替换表的原名和播报名称不能为空")
        result[name] = spoken
    return result


def speech_text(text: str, aliases: str = DEFAULT_ALIASES) -> str:
    for name, spoken in sorted(alias_map(aliases).items(), key=lambda item: -len(item[0])):
        text = re.sub(r"(?<![A-Za-z])" + re.escape(name) + r"(?![A-Za-z])", lambda _: spoken, text, flags=re.I)
    text = re.sub(r"(-?\d+(?:\.\d+)?)%", r"百分之\1", text)
    return text.strip()
