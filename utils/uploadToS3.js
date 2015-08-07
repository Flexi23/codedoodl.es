#!/usr/bin/env node

// config is coffee....
require('coffee-script/register');

var fs             = require('fs');
var s3             = require('s3');
var path           = require('path');
var validatePath   = require('./validateDoodleDirPath');
var getCredentials = require('./getCredentials');
var config         = require('../config/server');

var gzippableRe = /\.(css|js|svg|gz|html|xml|json)(?:$|\?)/;
var versionedRe = /\.(css|js|jpg|gif|mp4|webm)(?:$|\?)/;

function getS3ParamsAssets(file, stat, cb) {
    var s3Params = {};

    if (gzippableRe.test(path.extname(file))) {
        s3Params.ContentEncoding = 'gzip';
    }

    if (versionedRe.test(path.extname(file))) {
        s3Params.Expires = new Date((new Date).setYear((new Date).getFullYear() + 1))
    }

    cb(null, s3Params);
}

function getUploadParamsDir(uploadingAssets, toLive, localDir, bucket) {
    var params = {
        localDir: localDir,
        deleteRemoved: false, // default false, whether to remove s3 objects 
                              // that have no corresponding local file.
        s3Params: {
            Bucket: bucket
            // other options supported by putObject, except Body and ContentLength. 
            // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property 
        }
    };

    if (!uploadingAssets) {
        params.s3Params.Prefix = localDir.replace('doodles/', '');
    }

    if (toLive) {
        params.getS3Params = getS3ParamsAssets;
    }

    return params;
}

function getUploadParamsSingle(uploadingAssets, toLive, localFile, bucket) {
    var params = {
        localFile: localFile,
        s3Params: {
            Bucket: bucket
        }
    };

    if (!uploadingAssets) {
        params.s3Params.Key = localFile.replace('doodles/', '');
    } else {
        params.s3Params.Key = localFile;
    }

    // if (toLive) {
    //     params.getS3Params = getS3ParamsAssets;
    // }

    return params;
}

function getClient(creds) {
    var client = s3.createClient({
        maxAsyncS3: 20,     // this is the default
        s3RetryCount: 3,    // this is the default
        s3RetryDelay: 1000, // this is the default
        multipartUploadThreshold: 20971520, // this is the default (20 MB)
        multipartUploadSize: 15728640, // this is the default (15 MB)
        s3Options: {
            accessKeyId: creds.aws.id,
            secretAccessKey: creds.aws.key,
            region : creds.aws.region
            // any other options are passed to new AWS.S3()
            // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
        },
    });

    return client;
}

function startUploader(method, client, params, cb) {
    console.log('\n\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n');
    console.log('UPLOADING TO BUCKET '+params.s3Params.Bucket);
    console.log('\n\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\n');

    var uploader = client[method](params);
    uploader.on('error', function(err) {
        console.error("unable to sync:", err.stack);
    });
    uploader.on('progress', function() {
        console.log("progress", uploader.progressAmount, uploader.progressTotal);
    });
    uploader.on('end', function() {
        console.log("done uploading");
        if (typeof cb === 'function') {
            cb();
        }
    });
}

function uploadAssets(cb) {
    var creds, client, uploadParams;

    creds        = getCredentials();
    client       = getClient(creds);
    uploadParams = getUploadParamsDir(true, true, "app/public/", config.buckets.ASSETS);

    startUploader('uploadDir', client, uploadParams, cb);
};

function uploadDoodle(toLive, path, cb) {
    var doodlePath, creds, client, uploadParams;
    var bucket = toLive ? config.buckets.SOURCE : config.buckets.PENDING;

    doodlePath   = validatePath('doodles/', path)
    creds        = getCredentials();
    client       = getClient(creds);
    uploadParams = getUploadParamsDir(false, toLive, doodlePath, bucket);

    startUploader('uploadDir', client, uploadParams, cb);
}

function uploadSingleFile(filePath, cb) {
    var creds, client, uploadParams;

    creds        = getCredentials();
    client       = getClient(creds);
    uploadParams = getUploadParamsSingle(false, true, filePath, config.buckets.SOURCE);

    startUploader('uploadFile', client, uploadParams, cb);
}

module.exports = {
    uploadAssets        : uploadAssets,
    uploadDoodlePending : uploadDoodle.bind(null, false),
    uploadDoodleLive    : uploadDoodle.bind(null, true),
    uploadSingleFile    : uploadSingleFile
};
