from odoo import http
from odoo.http import request
import json
from openai import OpenAI
import os

from jinja2 import Environment, FileSystemLoader


class OpenAiStreamController(http.Controller):

    @http.route('/ai/stream', type='http', auth='user', methods=['POST'], csrf=False)
    def ai_stream(self, **kwargs):
        # 獲取原始 POST 數據
        body = json.loads(request.httprequest.data)
        pre_content = body.get('pre_content', '')
        user_input = body.get('message', '')
        post_content = body.get('post_content', '')

        # ir.config_parameter
        api_key = request.env['ir.config_parameter'].sudo().get_param('openai.api_key')
        # todo: provider select
        model_name = request.env['ir.config_parameter'].sudo().get_param('openai.model_name')
        client = OpenAI(api_key=api_key)

        # todo: post filter
        rag_records = request.env['rag.data'].sudo().search([('active', '=', True)])

        rag_inject = []

        for r in rag_records:
            _tmp_r = dict()
            if r.image:
                _tmp_r["image_id"] = r.id
            if r.image:
                _tmp_r["image_name"] = r.name
            if r.url:
                _tmp_r["url"] = r.url
            if r.content:
                _tmp_r["content"] = r.content
            rag_inject.append(_tmp_r)

        rag_inject_content = json.dumps(rag_inject, ensure_ascii=False)

        def system_json(v):
            return {"role": "system", "content": v}

        def generate():
            messages = []

            if pre_content != "":
                messages.append(system_json(pre_content))

            if rag_inject_content != "":
                messages.append(system_json("Please use the following information as a basis when responding: \n" + rag_inject_content + "\n If I ask about images, I should respond with the image ID from the JSON I just provided, in the format {{%%img:id%%}}."))

            messages.append({"role": "user", "content": user_input})

            if post_content != "":
                messages.append(system_json(post_content))

            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True
            )
            for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    # Odoo 底層基於 Werkzeug，格式須符合 SSE
                    yield f"data: {json.dumps({'text': content})}\n\n"

        # 回傳 Werkzeug Response 對象以支持串流
        return request.make_response(
            generate(),
            headers=[
                ('Content-Type', 'text/event-stream'),
                ('Cache-Control', 'no-cache'),
                ('Connection', 'keep-alive'),
                ('X-Accel-Buffering', 'no')  # 針對 Nginx 優化，防止緩存導致串流失效
            ]
        )

    @http.route('/ai/tts', type='http', auth='user', methods=['POST'], csrf=False)
    def ai_tts(self, **kwargs):
        body = json.loads(request.httprequest.data)
        text = body.get('text', '')

        params = request.env['ir.config_parameter'].sudo()
        provider = params.get_param('tts.provider', 'openai')

        provider_callback = {
            'openai': self._get_openai_tts,
            'google': self._get_google_tts,
            'elevenlabs': self._get_elevenlabs_tts,
        }

        tts_provider_function = provider_callback.get(provider, self._get_openai_tts)
        return tts_provider_function(text, params)

    def _get_openai_tts(self, text, params):
        """ OpenAI TTS 實作 """
        api_key = params.get_param('openai.api_key')
        if not api_key:
            raise ValueError("OpenAI API Key 尚未設定")

        client = OpenAI(api_key=api_key)
        response = client.audio.speech.create(
            model="tts-1",
            voice="ash",  # 預設中性金屬音
            input=text,
        )
        return response.content

    def _get_google_tts(self, text, params):
        from google.cloud import texttospeech
        from google.api_core.client_options import ClientOptions


        addon_path = os.path.dirname(os.path.dirname(__file__))
        key_path = os.path.join(addon_path, 'keys', 'gcp_auth.json')
        client = texttospeech.TextToSpeechClient.from_service_account_file(key_path)

        # prompt 參數控制語氣
        synthesis_input = texttospeech.SynthesisInput(
            text=text,
            prompt="Happy tone."
        )

        voice = texttospeech.VoiceSelectionParams(
            language_code="cmn-TW",  # 確保中文發音
            name="Kore",
            model_name="gemini-2.5-pro-tts"
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )

        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )

        return response.audio_content

    def _get_elevenlabs_tts(self, text, params):
        from elevenlabs.client import ElevenLabs

        api_key = params.get_param('elevenlabs.api_key')
        if not api_key:
            raise ValueError("ElevenLabs API Key 尚未設定")

        client = ElevenLabs(api_key=api_key)

        audio_generator = client.text_to_dialogue.convert(
            inputs=[
                {
                    "text": text,
                    "voice_id": "9BWtsMINqrJLrRacOk9x", # 可替換為 Odoo 設定檔中的值
                }
            ]
        )

        if not isinstance(audio_generator, bytes):
            audio_generator = b"".join(audio_generator)

        # 這裡就是關鍵的 Headers 修正
        headers = [
            ('Content-Type', 'audio/mpeg'),
            ('Content-Length', str(len(audio_generator))),  # 必須精準告知長度
            ('Accept-Ranges', 'none'),  # 【核心】告訴瀏覽器：別試圖分段讀取
            ('Cache-Control', 'no-cache'),
        ]

        return request.make_response(audio_generator, headers=headers)

    def _get_html_template(self):
        addon_path = os.path.dirname(os.path.dirname(__file__))
        template_dir = os.path.join(addon_path, 'static')
        env = Environment(loader=FileSystemLoader(template_dir))

        return env.get_template('html/chat.html').render()

    @http.route('/ai/chat', type='http', auth='public')
    def ai_page(self):
        content = self._get_html_template()
        return request.make_response(content, [('Content-Type', 'text/html')])

    @http.route('/image/<int:rec_id>', type='http', auth='public', methods=['GET'])
    def get_rag_image(self, rec_id, **kwargs):
        record = request.env['rag.data'].sudo().browse(rec_id)

        if not record.exists() or not record.image:
            # 404
            return request.not_found()

        return request.env['ir.binary']._get_stream_from(record, 'image').get_response()
