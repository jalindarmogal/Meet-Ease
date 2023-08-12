const otpService = require('../services/otp-service');
const hashService = require('../services/hash-service');
const userService = require('../services/user-service');
const tokenService = require('../services/token-service');
const UserDto = require('../dtos/user-dto');

class AuthController {
    async sendOtp(req, res){

        const { phone } = req.body;
        
        if(!phone){
            res.status(400).json({message: 'Phone field is required'});
        }

        //generate otp
        const otp = await otpService.generateOtp();

        //hash
        const ttl = 1000*60*2; //time-to-leave - 2min
        const expires = Date.now()+ttl;
        const data = `${phone}.${otp}.${expires}` ;  //hash
        const hash = hashService.hashOtp(data);

        //send otp 
        try {
            // await otpService.sendBySms(phone, otp);
             res.json({
                hash: `${hash}.${expires}`,
                phone,
                otp,    //temporary
            });

        } catch(err){
            console.log(err);
            res.status(500).json({message: 'message sending failed'});
        }

        // res.json({hash: hash});
    }

    async verifyOtp(req,res){
        const { otp, hash, phone } = req.body;
        if(!otp || !hash || !phone){
            res.status(400).json({message:'All fields are required!'});
        }

        const [hashedOtp, expires] = hash.split('.');
        if(Date.now() > +expires){
            res.status(400).json({message:'OTP expired!'});
        }

        const data = `${phone}.${otp}.${expires}` ;  

        const isValid = otpService.verifyOtp(hashedOtp, data);

        if(!isValid){
            res.status(400).json({message:'Invalid OTP!'});
        }

        let user;

        try{
            user = await userService.findUser({phone});
            if(!user){
               user = await userService.createUser({ phone});
            }
        } catch(err){
            console.log(err);
            res.status(500).json({message: 'db error'});
            
        }

        //tokens generated here
        const { accessToken, refreshToken } = tokenService.generateTokens({
            _id: user._id,
            activated: false,
        });
        
        //adding refresh token to cookies
        //but not stored in db. and if user logs out then we have to erase refreshtoken
        //to store refreshtoken in databse, we need module callled refresh-model.js
       
        await tokenService.storeRefreshToken(refreshToken, user._id);
       
        res.cookie('refreshToken', refreshToken , {
            maxAge: 1000*60*30*24,
            httpOnly: true,
        });

        //storing accessToken in db is not secure, so we will store it in cookie
        res.cookie('accessToken', accessToken , {
            maxAge: 1000*60*30*24,
            httpOnly: true,
        });
        
        const userDto = new UserDto(user);
        res.json({user: userDto, auth: true });
    }
}

module.exports = new AuthController();