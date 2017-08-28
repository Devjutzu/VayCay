const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const {
  Place
} = require('../models/places')
const {
  User
} = require('../models/users')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const passport = require('passport')
const path = require('path')
const LocalStrategy = require('passport-local').Strategy;
const multer = require('multer');
const upload = multer({
  dest: '../tmp/'
});
const cloudinary = require('cloudinary')

const { options } = require('../config')

cloudinary.config({
  cloud_name: options.cloud_name,
  api_key: options.api_key,
  api_secret: options.api_secret
});

function isLoggedIn(req, res, next) {
  if (!req.user) {
    res.redirect('/login')
  }else{
    next()
  }
}

function isOwner(req, res, next) {
  console.log("req.params", req.params.id)
  Place.findById(req.params.id).then(place => {
    if (JSON.stringify(req.user._id) !== JSON.stringify(place.creator)) {
      res.redirect(`/places/${req.params.id}?message=You+are+not+the+owner`)
    } else {
      next()
    }
  })
}
function isOnly(req,res,next){
  User.findOne({email:req.body.email},function(err,user){
    console.log('user', user)
    if(user) {
      res.redirect('/login');
    } else{
      next();
    }
  })
}
/* ALL GET ROUTERS */
router.get('/', isLoggedIn, (req, res) =>{
  req.flash('info', 'You are already logged in!')
  res.redirect('/places'); 
})
router.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login'
  });
});
router.get('/loginFailure', (req, res) => {
  res.render('loginFailure', {
    title: 'Login'
  });
});
router.get('/register', (req, res) => {
  res.render('register', {
    title: 'Register',
  });
});
router.get('/add', isLoggedIn, (req, res) => {
  res.render('addPlace', {
    title: 'Add a Place'
  })
})
router.get('/places', isLoggedIn, (req, res) => {
  Place
    .find()
    .then(place => {
      res.render('content', {
        place
      })
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({
        error: 'something went terribly wrong'
      });
    });
});
router.get('/places/:id', isLoggedIn, (req, res) => {
  console.log('places/id', req.query)
  Place
    .findById(req.params.id)
    .then((place) => res.render('fullPage', {
      place
    }))
    .catch(err => {
      console.error(err);
      res.status(500).json({
        error: 'something went terribly wrong'
      });
    });

});
router.get('/faves', isLoggedIn, (req, res) => {
  User.findById(req.user.id).then((user) => {
    const favorites = user.faves
    Place.find({
      '_id': {
        $in: favorites
      }
    }).then((place) => res.render('content', {
      place
    }));
  })
})
router.get('/edit/:id', isLoggedIn,isOwner, (req, res) => {
  Place.findById(req.params.id)
    .then((place) => {

      if (place.creator == req.user.id) {
        res.render('editPlace', {
          place
        })
      } else {
        res.redirect('/places')
      }
    })
});

router.get('/logout', (req, res) => {
  req.session.destroy(function (err) {
    res.redirect('/'); //Inside a callback… bulletproof!
  });

})
//local strat pp
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  },
  function (email, password, done) {
    User.findOne({
      email
    }, function (err, user) {
      if (err) {
        return done(err);
      }
      if (!user) {
        return done(null, false, {
          message: 'Incorrect username.'
        });
      }
      bcrypt.compare(password, user.password, function (err, res) {
        if (!res) {
          return done(null, false, {
            message: 'Incorrect password.'
          });
        }
        return done(null, user);
      });
    });
  }
));
passport.serializeUser(function (user, done) {
  done(null, user.id);
});
passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});
/* ALL POST ROUTERS */
router.post('/login', function(req, res, next) {
  console.log('hitting login')
  passport.authenticate('local', function(err, user, info) {
    
    if (err) { next(err); }
    if (!user) { 
      console.log('failure')
      return res.redirect('/login'); 
    }
    req.logIn(user, function(err) {
      console.log("success err", err)
      if (err) { next(err); }
      else {
        console.log("success")
        return res.redirect('/places');
      }
    });
 
  })(req, res, next);
});

router.post('/register',isOnly, (req, res) => {
  const requiredFields = ['email', 'password', 'password-confirm'];
  for (let i = 0; i < requiredFields.length; i++) {
    const field = requiredFields[i];
    if (!(field in req.body)) {
      const message = `Missing \`${field}\` in request body`
      console.error(message);
      res.render('register', {
        message
      })
    }
  }
  req.checkBody('password-confirm', 'Passwords must Match').equals(req.body.password)
  req.checkBody('email', 'Please enter a valid email').isEmail();

  const newUser = new User({
    email: req.body.email,
    password: req.body.password,
    faves: []
  })
  hash(newUser, (err, user) => {
    if (err) throw err;
    User.create(user)
  })
  res.redirect('/login')
  req.flash('success', 'You are signed up, Test your login skills')
  
})

function hash(newUser, callback) {
  bcrypt.genSalt(10, function (err, salt) {
    bcrypt.hash(newUser.password, salt, function (err, hash) {
      newUser.password = hash;
      newUser.save(callback)
    });
  });
}
router.post('/add', isLoggedIn, upload.single('photo'), (req, res) => {
  const requiredFields = ['locationName', 'description', 'activities'];
  for (let i = 0; i < requiredFields.length; i++) {
    const field = requiredFields[i];
    if (!(field in req.body)) {
      const message = `Missing \`${field}\` in request body`
      console.error(message);
      console.log(req.body)
      res.redirect('/add', {
        message
      })
    }
  }
  cloudinary.uploader.upload(req.file.path, function (result) {
    console.log(result);
    Place.create({
        locationName: req.body.locationName,
        photo: result.secure_url,
        description: req.body.description,
        activities: req.body.activities,
        creator: req.user.id
      })
      .then((place) => res.render('fullPage', {
        message: req.flash('info') ,
        place
      }))
  });
})
//});
router.post('/edit/:id', isLoggedIn, isOwner, upload.single('photo'), (req, res) => {
  const requiredFields = ['locationName', 'description', 'activities'];
  for (let i = 0; i < requiredFields.length; i++) {
    const field = requiredFields[i];
    if (!(field in req.body)) {
      const message = `Missing \`${field}\` in request body`
      console.error(message);
      res.redirect(`/edit/${req.params.id}` /* , {message} */ )
    }
  }
  cloudinary.uploader.upload(req.file.path, function (result) {
    console.log(result);
    Place.findByIdAndUpdate(req.params.id, {
        locationName: req.body.locationName,
        photo: result.secure_url,
        description: req.body.description,
        activities: req.body.activities
      }, {
        new: true
      })
      .then((place) => res.render('fullPage', {
        message: req.flash('success', 'Successfully Updated'),
        place
      }))
  });
//});
router.post('/fave/:id',isLoggedIn, (req, res) => {
  if (!req.user) {
    res.redirect('/login' /* ,{message:'Must be logged in to do that'} */ )
  } else {
    User.findByIdAndUpdate(req.user.id, {
      $push: {
        faves: req.params.id
      }
    }, {
      new: true
    }, function (err, doc) {
      if (err) {
        console.log("Something wrong when updating data!");
        res.redirect(`/places/${req.params.id}` /* ,{message: 'Something went wrong when adding to your faves, Please try again'} */ )
      }
      console.log(doc);
      console.log(req.user.id)
      res.redirect("/faves" /* , {message:'Successfully added to your favorites!'} */ )
    })
  }
})
router.post('/reviews/:id',isLoggedIn, (req, res) => {
  Place.findByIdAndUpdate(req.params.id, {
    $push: {
      messages: req.body.reviewText
    }
  }, {
    new: true
  }, function (err, doc) {
    if (err) {
      console.log("Something wrong when updating data!");
      res.redirect(`/places/${req.params.id}` /* ,{message: 'Something went wrong when adding your review, Please try again'} */ )
    }
    console.log(doc);
  })
  res.redirect(`/places/${req.params.id}` /* ,{message:'Successfully added the review!'} */ )
})
router.post('/delete/:id',isLoggedIn, isOwner, (req, res) => {
  Place.findByIdAndRemove(req.params.id).then(res.redirect('/places'))
})

module.exports = router;