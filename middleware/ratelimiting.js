import rateLimit from 'express-rate-limit'

const authlimit = rateLimit ({
     windowMs: 5 * 60 * 1000, 
    max: 5,
    message: { error: "Too many many, please try again later." }
})

export default authlimit