from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    openai_api_key = fields.Char(
        string="OpenAI API Key",
        config_parameter='openai.api_key'
    )
    openai_model_name = fields.Char(
        string="Default Model",
        default="gpt-5.2",
        config_parameter='openai.model_name'
    )
