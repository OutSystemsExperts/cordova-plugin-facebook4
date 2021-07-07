#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var plist = require('plist');
var utils = require("./utils");
var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;

module.exports = function(context) {
    return new Promise(function(resolve, reject) {

        var platform = context.opts.platforms[0];

        function findFacebookConfigFile(base, files, result) {
            var fileNameToFindRegEx = (platform == "ios" ? /[a-z]+-info.plist/gi : /facebookconnect\.xml/gi)
            
            files = files || fs.readdirSync(base);
            result = result || (platform == "ios" ? "*-info.plist not found" : "facebookconnect.xml not found");

            files.some(function(file) {
                var newDir = path.join(base, file);
                var isDirectory = false;
                try {
                    isDirectory = fs.statSync(newDir).isDirectory(); 
                } catch (err) {
                    isDirectory = false;
                }
                if (isDirectory) {
                    result = findFacebookConfigFile(newDir, fs.readdirSync(newDir), result);
                } else {
                    var match = fileNameToFindRegEx.exec(file);
                    if (match && match.length !== 0) {
                        result = path.join(base, file);
                        return true;
                    }
                }
            });

            return result;

        }

        var getPreferenceValue = function(config, name) {
            var value = config.match(new RegExp('name="' + name + '" value="(.*?)"', "i"))
            if(value && value[1]) {
                return value[1]
            } else {
                return null
            }
        }
        
        if(process.argv.join("|").indexOf("APP_ID=") > -1) {
            var APP_ID = process.argv.join("|").match(/APP_ID=(.*?)(\||$)/)[1]
        } else {
            var config = fs.readFileSync("config.xml").toString()
            var APP_ID = getPreferenceValue(config, "APP_ID")
        }
        
        var files = [
            "platforms/browser/www/plugins/cordova-plugin-facebook4/www/facebook-browser.js",
            "platforms/browser/platform_www/plugins/cordova-plugin-facebook4/www/facebook-browser.js",
            "platforms/browser/www/cordova.js",
            "platforms/browser/platform_www/cordova.js"
        ]

        for(var i in files) {
            try {
                var contents = fs.readFileSync(files[i]).toString()
                fs.writeFileSync(files[i], contents.replace(/APP_ID/g, APP_ID))
            } catch(err) {}
        }

        console.log(context);   
        var wwwPath = utils.getWwwPath(context);
        var configPath = path.join(wwwPath, "facebookLogin");

        var preferredJSONFilename = "facebook_login.json";

        var fullJSONPath = path.join(configPath, preferredJSONFilename);

        fs.readFile(fullJSONPath, 'utf8', (err, jsonString) => {
            if (err) {
                console.log("Error reading file: ", err);
                return reject(
                    "Error reading JSON file: " + err
                );
            } else {
                var facebookLoginJSON = JSON.parse(jsonString);

                var notFoundRegEx = /not found/gi;
                var result = findFacebookConfigFile(utils.getPlatformPath(context)); 
                console.log(platform + ": " + result);
                var match = notFoundRegEx.exec(result);
                if (!match) {
                    switch (platform) {
                        case "ios":
                            var jsonObj = plist.parse(fs.readFileSync(result, 'utf-8'));
                            jsonObj.FacebookAppID = facebookLoginJSON.APP_ID;
                            jsonObj.FacebookDisplayName = facebookLoginJSON.APP_NAME;
                            jsonObj.CFBundleURLTypes[0].CFBundleURLSchemes[0] = "fb" + facebookLoginJSON.APP_ID;
                            var builtJSON = plist.build(jsonObj);
                            fs.writeFileSync(result, builtJSON);
                            break;
                    
                        default:
                            var parser = new DOMParser();
                            var xmlContents = fs.readFileSync(result, 'utf-8');
                            var doc = parser.parseFromString(xmlContents, "text/xml");
                            doc.getElementsByTagName("string")[0].textContent = facebookLoginJSON.APP_ID;
                            doc.getElementsByTagName("string")[1].textContent = facebookLoginJSON.APP_NAME;
                            var xmlSerializer = new XMLSerializer();
                            console.log(xmlSerializer.serializeToString(doc));
                            fs.writeFileSync(result, xmlSerializer.serializeToString(doc))
                            break;
                    }
                } else {
                    console.log(result);
                }
            }
        });

        return resolve();
    });
};
