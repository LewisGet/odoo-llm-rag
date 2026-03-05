from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    openai_api_key = fields.Char(
        string="OpenAI API Key",
        config_parameter='openai.api_key'
    )
    google_api_key = fields.Char(
        string="Google API Key",
        config_parameter='google.api_key'
    )
    elevenlabs_api_key = fields.Char(
        string="ElevenLabs API Key",
        config_parameter='elevenlabs.api_key'
    )


    openai_model_name = fields.Char(
        string="Default Model",
        default="gpt-5.2",
        config_parameter='openai.model_name'
    )
    tts_provider = fields.Selection([
        ('openai', 'OpenAI'),
        ('google', 'Google Cloud TTS'),
        ('aws', 'AWS Polly'),
        ('elevenlabs', 'ElevenLabs')
    ], string="TTS 服務商", default='openai', config_parameter='tts.provider')

    google_tts_model = fields.Selection([
        ('gemini-2.5-pro-tts', 'gemini-2.5-pro-tts'),
        ('gemini-2.5-flash-tts', 'gemini-2.5-flash-tts'),
        ('cmn-TW-Standard-A', 'cmn-TW-Standard-A'),
    ], string="googel tts 模型", default='gemini-2.5-flash-tts', config_parameter='google.tts_model')
