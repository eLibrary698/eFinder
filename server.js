require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const nodemailer = require('nodemailer');
const Mailjet = require('node-mailjet');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);
let booksCollection;

async function connectToDatabase() {
    try {
        await client.connect();
        const database = client.db("bookstore");
        booksCollection = database.collection("books");
        
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Could not connect to MongoDB", error);
        process.exit(1);
    }
}

// 配置 Mailjet
const mailjet = new Mailjet({
    apiKey: process.env.MJ_APIKEY_PUBLIC,
    apiSecret: process.env.MJ_APIKEY_PRIVATE
});

app.post('/search', async (req, res) => {
    const searchTerm = req.body.searchTerm;
    const page = parseInt(req.body.page) || 1;
    const pageSize = 20;
    console.log(`Searching for: "${searchTerm}" (Page ${page})`);

    try {
        if (!booksCollection) {
            throw new Error("Database not connected");
        }

        const query = {
            $or: [
                { title: { $regex: searchTerm, $options: 'i' } },
                { filename: { $regex: searchTerm, $options: 'i' } },
                { path: { $regex: searchTerm, $options: 'i' } }
            ]
        };

        const totalResults = await booksCollection.countDocuments(query);
        console.log(`Total results for query: ${totalResults}`);

        const results = await booksCollection.find(query)
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .toArray();

        console.log(`Number of results returned: ${results.length}`);

        res.json({
            found: totalResults > 0,
            totalResults,
            currentPage: page,
            totalPages: Math.ceil(totalResults / pageSize),
            results: results.map(r => r.title)
        });
    } catch (error) {
        console.error("Error during search:", error);
        res.status(500).json({ error: "An error occurred during search", details: error.message });
    }
});

app.post('/submit-email', (req, res) => {
    const email = req.body.email;
    const searchTerm = req.body.searchTerm || 'No search term specified';
    const found = req.body.found;
    const language = req.body.language || 'en'; // 新增：获取语言设置
    console.log(`Received email: ${email} for search term: ${searchTerm}, Found: ${found}, Language: ${language}`);

    const emailContent = {
        en: {
            found: {
                subject: "Thank you for using E-book and Video Search Service - Search Request Confirmation",
                textPart: `Dear user,

We have received your search request. Here are the details:

Search content: "${searchTerm}"

We have found relevant content. Please wait, and one of our service representatives will contact you via email to confirm if the found content matches your requirements. Please check your inbox.

Thank you for using our service!`,
                htmlPart: `<h3>Thank you for using E-book and Video Search Service - Search Request Confirmation</h3>
<p>Dear user,</p>
<p>We have received your search request. Here are the details:</p>
<p><strong>Search content:</strong> "${searchTerm}"</p>
<p>We have found relevant content. Please wait, and one of our service representatives will contact you via email to confirm if the found content matches your requirements. Please check your inbox.</p>
<p>Thank you for using our service!</p>`
            },
            notFound: {
                subject: "Thank you for using E-book and Video Search Service - Search Request Confirmation",
                textPart: `Dear user,

We have received your search request. Here are the details:

Search content: "${searchTerm}"

We will reply to you within 1-3 business days to let you know if we can find the material you need. If you have any other questions, please feel free to contact us.

Thank you for using our service!`,
                htmlPart: `<h3>Thank you for using E-book and Video Search Service - Search Request Confirmation</h3>
<p>Dear user,</p>
<p>We have received your search request. Here are the details:</p>
<p><strong>Search content:</strong> "${searchTerm}"</p>
<p>We will reply to you within 1-3 business days to let you know if we can find the material you need. If you have any other questions, please feel free to contact us.</p>
<p>Thank you for using our service!</p>`
            }
        },
        zh: {
            found: {
                subject: "感谢您使用电子书和视频代找服务 - 查找请求确认",
                textPart: `尊敬的用户，

我们已收到您的查找请求。以下是请求详情：

查找内容："${searchTerm}"

我们已经查询到内容，请稍等，我们会有服务专员通过邮件与您联系，确认查询到的内容是否与您的需求匹配，请注意查收。

谢谢您使用我们的服务！`,
                htmlPart: `<h3>感谢您使用电子书和视频代找服务 - 查找请求确认</h3>
<p>尊敬的用户，</p>
<p>我们已收到您的查找请求。以下是请求详情：</p>
<p><strong>查找内容：</strong>"${searchTerm}"</p>
<p>我们已经查询到内容，请稍等，我们会有服务专员通过邮件与您联系，确认查询到的内容是否与您的需求匹配，请注意查收。</p>
<p>谢谢您使用我们的服务！</p>`
            },
            notFound: {
                subject: "感谢您使用电子书和视频代找服务 - 查找请求确认",
                textPart: `尊敬的用户，

我们已收到您的查找请求。以下是请求详情：

查找内容："${searchTerm}"

我们会在1-3个工作日内给您回复是否可以找到您需要的资料。如果您有任何其他问题，请随时与我们联系。

谢谢您使用我们的服务！`,
                htmlPart: `<h3>感谢您使用电子书和视频代找服务 - 查找请求确认</h3>
<p>尊敬的用户，</p>
<p>我们已收到您的查找请求。以下是请求详情：</p>
<p><strong>查找内容：</strong>"${searchTerm}"</p>
<p>我们会在1-3个工作日内给您回复是否可以找到您需要的资料。如果您有任何其他问题，请随时与我们联系。</p>
<p>谢谢您使用我们的服务！</p>`
            }
        }
    };

    const content = emailContent[language][found ? 'found' : 'notFound'];

    // 使用 Mailjet 发送邮件
    const request = mailjet
        .post("send", {'version': 'v3.1'})
        .request({
            "Messages":[
                {
                    "From": {
                        "Email": process.env.MJ_SENDER_EMAIL,
                        "Name": language === 'en' ? "E-book and Video Search Service" : "电子书和视频代找服务"
                    },
                    "To": [
                        {
                            "Email": email,
                            "Name": "User"
                        }
                    ],
                    "Subject": content.subject,
                    "TextPart": content.textPart,
                    "HTMLPart": content.htmlPart
                }
            ]
        });

    request
        .then((result) => {
            console.log('Email sent: ' + JSON.stringify(result.body));
            res.json({ success: true, message: language === 'en' ? "Email sent" : "邮件已发送" });
        })
        .catch((err) => {
            console.log(err.statusCode);
            res.status(500).json({ success: false, message: language === 'en' ? "Failed to send email" : "邮件发送失败" });
        });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectToDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch(error => {
    console.error("Failed to connect to the database", error);
    process.exit(1);
});