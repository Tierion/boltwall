import app from './app'

const port = process.env.PORT || 5000
//eslint-disable-next-line
app.listen(port, () => console.log(`listening on port ${port}!`))
