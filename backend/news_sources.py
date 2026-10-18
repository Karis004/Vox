"""Editable source defaults for the unified news module."""
from copy import deepcopy


def rss(name: str, url: str, date_mode: str = 'timestamp') -> dict:
    return dict(name=name, url=url, format='rss', date_mode=date_mode)


HKMA = dict(name='香港金管局', url='https://api.hkma.gov.hk/public/press-releases?lang=tc',
            format='json', date_mode='hong_kong_date', items_path='result.records',
            title_field='title', url_field='link', date_field='date', summary_field='')
SOURCE_PRESETS = {
    'global': [
        rss('CNBC全球', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362'),
        rss('CNBC财经', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664'),
        rss('BBC商业', 'https://feeds.bbci.co.uk/news/business/rss.xml'),
        rss('香港电台财经', 'https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml'),
        rss('香港电台国际', 'https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml'),
    ],
    'hong_kong': [rss('香港电台财经', 'https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml'), HKMA],
    'insurance': [
        rss('Artemis', 'https://www.artemis.bm/feed/'),
        rss('Insurance Journal', 'https://www.insurancejournal.com/rss/news/'),
        rss('SOA精算杂志', 'https://www.theactuarymagazine.org/feed/'),
        rss('Reinsurance News', 'https://www.reinsurancene.ws/feed/'),
        rss('香港保监局', 'https://www.ia.org.hk/tc/rss/rss_news_tc.xml', 'hong_kong_date'), HKMA,
    ],
}


def default_news_sources(topic: str, scope: str) -> list[dict]:
    return deepcopy(SOURCE_PRESETS['insurance' if topic == 'insurance' else scope])
