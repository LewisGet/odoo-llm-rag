from odoo import models, fields, api


class RagData(models.Model):
    _name = 'rag.data'
    _description = 'RAG'

    name = fields.Char(string="title", required=True, index=True)
    # todo: image 預讀取在前端，或者控制器讀圖片，llm rag 吃進去時是 (img:id) 再讓前端修改文字節省 content window
    image = fields.Binary(string="image")
    url = fields.Char(string="url")

    content = fields.Text(string="content", help="")

    # todo: not now, 自己模型可以插入 vector
    # 抽象化擴展：預留向量儲存空間（通常搭配 pgvector 或外部 Vector DB）
    # vector_data = fields.Binary(string="向量索引 (Embeddings)", help="存儲內容的數學向量特徵")

    active = fields.Boolean(default=True)
    # todo: user odoo tags
    # category_id = fields.Many2one('rag.category', string="知識分類")

    user_id = fields.Many2one(
        'res.users',
        string='create user',
        default=lambda self: self.env.user,
        index=True
    )

    # todo: role placeholder
