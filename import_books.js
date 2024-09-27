const xlsx = require('xlsx');
const { MongoClient } = require('mongodb');
const path = require('path');

const BOOK_LIST_PATH = path.join(__dirname, 'booklist.xlsx');
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

function extractTitleFromPath(filePath) {
    const parts = filePath.split('/');
    return parts[parts.length - 1].replace(/\.[^/.]+$/, "");
}

async function importBooks() {
    try {
        await client.connect();
        const database = client.db("bookstore");
        const booksCollection = database.collection("books");

        const workbook = xlsx.readFile(BOOK_LIST_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawBooks = xlsx.utils.sheet_to_json(sheet, { header: "A" });
        
        console.log("Raw data sample:", JSON.stringify(rawBooks.slice(0, 5), null, 2));

        const books = rawBooks.map(book => {
            const filePath = book.A;  // 假设数据在 A 列
            return { 
                title: extractTitleFromPath(filePath),
                filename: filePath,
                path: filePath
            };
        });

        await booksCollection.deleteMany({});  // Clear existing data
        const result = await booksCollection.insertMany(books);
        
        console.log(`${result.insertedCount} books imported successfully`);

        // 打印前几本书的信息，以验证数据格式
        const sampleBooks = await booksCollection.find().limit(5).toArray();
        console.log("Sample books:", JSON.stringify(sampleBooks, null, 2));

    } catch (error) {
        console.error("Error importing books:", error);
    } finally {
        await client.close();
    }
}

importBooks();