from odoo import http
from odoo.http import request
import json
from openai import OpenAI
import os


class OpenAiStreamController(http.Controller):

    @http.route('/ai/stream', type='http', auth='user', methods=['POST'], csrf=False)
    def ai_stream(self, **kwargs):
        # 獲取原始 POST 數據
        body = json.loads(request.httprequest.data)
        user_input = body.get('message', '')

        # ir.config_parameter
        api_key = request.env['ir.config_parameter'].sudo().get_param('openai.api_key')
        # todo: provider select
        # todo: model select
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

        def generate():
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "Please use the following information as a basis when responding: \n" + rag_inject_content},
                    {"role": "user", "content": user_input}
                ],
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

    def _get_html_template(self):
        addon_path = os.path.dirname(os.path.dirname(__file__))
        file_path = os.path.join(addon_path, 'static', 'html', 'chat.html')
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

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
