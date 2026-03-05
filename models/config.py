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
