// other requires
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const { runInNewContext } = require("vm");

const mongoose = require("mongoose")
const session = require("express-session")
const passport = require("passport")
const passportLocalMongoose = require("passport-local-mongoose");
const { json } = require("body-parser");

require("dotenv").config();

// app.use statements
const app = express();

//set up passport
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(session({
    secret: process.env.SECRET, // stores our secret in our .env file
    resave: false,              // other config settings explained in the docs
    saveUninitialized: false
}));

//using mongo DB
mongoose.connect("mongodb://localhost:27017/todo", 
{useNewUrlParser: true, // these avoid MongoDB deprecation warnings
useUnifiedTopology: true});                  


const userSchema = new mongoose.Schema ({
    username: String,
    password: String
});

userSchema.plugin(passportLocalMongoose);   

const User = new mongoose.model("User", userSchema)

// more passport-local-mongoose config
// create a strategy for storing users with Passport
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


const taskSchema = new mongoose.Schema ({
	name : String , 
	owner: userSchema,
	creator:userSchema,
	done: Boolean,
	cleared :Boolean
});

const Task = new mongoose.model("Task", taskSchema);


async function databaseCalls () {
    const task = new Task({
        name : "Unclaimed" , 
        owner: undefined,
        creator: {username:"user1@abc.com"},
        done: false,
        cleared :false
    });
    await task.save();

    const task1 = new Task({
        name : "Owned by 0, Unfinished" , 
        owner: {username: "user1@abc.com"},
        creator: {username:"user1@abc.com"},
        done: false,
        cleared :false
    });
    await task1.save();

    const task2 = new Task({
        name : "Owned by 0, finished" , 
        owner: {username: "user1@abc.com"},
        creator: {username:"user1@abc.com"},
        done: true,
        cleared :false
    });
    await task2.save();

    const task3 = new Task({
        name : "Owned by 1, Unfinished" , 
        owner: {username: "user2@123.com"},
        creator: {username:"user1@abc.com"},
        done: false,
        cleared :false
    });
    await task3.save();

    const task4 = new Task({
        name : "Owned by 1, finished" , 
        owner: {username: "user2@123.com"},
        creator: {username:"user1@abc.com"},
        done: true,
        cleared :false
    });
    await task4.save();
}
//uncomment to add pre loaded task OFC this is hard coded into database
//databaseCalls();
const registerKey = "123456"; // secure!


app.listen(3000, function () {
    console.log("Server started on port 3000");
})

app.get("/", function (req, res) {
    res.render("index", { test: "Prototype" });
});


app.post("/register", function(req, res) {
    console.log("Registering a new user");
    // calls a passport-local-mongoose function for registering new users
    // expect an error if the user already exists!
    if (req.body.authentication === registerKey) {
        console.log("registration key successful");
        User.register({username: req.body.username}, req.body.password, function(err, user){
            if (err) {
                console.log(err);
                res.redirect("/");
            } else {
                // authenticate using passport-local
                // what is this double function syntax?! It's called currying.
                passport.authenticate("local")(req, res, function(){
                    res.redirect(307, "/todo");
                });
            }
        });
    }
    else{
        res.redirect("/");
    }
});

app.post("/login", function (req, res) {
    console.log("A user is logging in")
    // create a user
    const user = new User ({
        username: req.body.username,
        password: req.body.password
     });
    req.login (user, function(err) {
        if (err) {
            console.log(err);
            res.redirect("/")
        } else {
            passport.authenticate("local")(req, res, function() {
                res.redirect(307,"/todo"); 
            });
        }
    });

});

app.post("/todo", function (req, res) {    
    //Task.find().then(tasks =>console.log(tasks));
    Task.find({},function(err,data){
        if(err){
            console.log(err);
        }
        else 
        res.render("todo", {
            username: req.body.username,
            items :data 
        }); 
    });   
});

app.get("/logout", function (req, res) {
    req.logOut();
    res.redirect("/");
});

app.post("/addtask", function (req, res) {
    User.findOne({username : req.body.username},function(err,usr){
        if(err){
            console.log(err);
        }    
        console.log(usr);
        if(usr.username === req.body.username) {
        const task = new Task(
            {name : req.body.newTask , 
            owner: undefined,
            creator: usr,            
            done: false,
            cleared :false
        });
        task.save();
        res.redirect(307, "/todo");
        };
    });
});

app.post("/claim", function (req, res) {
    console.log(req.body);
    User.findOne({username : req.body.username},function(err,usr){
        if(err){
            console.log(err);
        }    
        console.log(usr);
        if(usr.username === req.body.username) {
            Task.findOne({ _id : req.body.taskId}, function(err,tsk){
                if(err){
                    console.log(err);
                }
                else
                    Task.updateOne( { _id : req.body.taskId}, {$set: {owner:usr}}, function(err){
                    if (err) {
                        console.log(err);
                    }
                    else
                        res.redirect(307, "/todo"); 
                });
            });
        }
    });
});

app.post("/abandonorcomplete", function (req, res) {
    if (req.body.checked === "on") {
        Task.findOne({ _id : req.body.taskId}, function(err,tsk){
            Task.updateOne( { _id : req.body.taskId}, {$set: {done:true}}, function(err){
                if (err) {
                    console.log(err);
                }
                else
                    res.redirect(307, "/todo"); 
            });
        });
    } else {
        // you are "user"
        Task.findOne({ _id : req.body.taskId}, function(err,tsk){

            Task.updateOne( { _id : req.body.taskId}, {$set: {owner:undefined}}, function(err){
                if (err) {
                    console.log(err);
                }
                else
                    res.redirect(307, "/todo"); 
            });
        });
    }
});

app.post("/unfinish", function (req, res) {
    Task.findOne({ _id : req.body.taskId}, function(err,tsk){
        Task.updateOne( { _id : req.body.taskId}, {$set: {done:false}}, function(err){
            if (err) {
                console.log(err);
            }
            else
                res.redirect(307, "/todo"); 
        });
    });
});

app.post("/purge", function (req, res) {
    Task.findOne({ _id : req.body.taskId}, function(err,tsk){
        Task.updateMany( { done: true}, {$set: {cleared:true}}, function(err){
            if (err) {
                console.log(err);
            }
            else
                res.redirect(307, "/todo"); 
        });
    });
});