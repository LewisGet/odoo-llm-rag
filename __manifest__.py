{
    'name': "lj_llm_rag",
    'version': '0.0.1',
    'demo': [],
    'depends': ['base', 'web'],
    'data': [
        'security/ir.model.access.csv',
        'views/chat_menu.xml',
        'views/res_config_settings_views.xml',
        'views/rag_views.xml',
    ],
    'qweb': [],
    'installable': True,
    'application': True,
}
