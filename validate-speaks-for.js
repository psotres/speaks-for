#!/usr/bin/env node

var fs = require('fs');
var _ = require('lodash');
var xmlcrypto = require('xml-crypto');
var dom = require('xmldom').DOMParser;

var utils = require('./utils');

var singleDayMillis = 86400000;
var yargs = require('yargs');
var argv = yargs
    .usage('Usage: $0 -s <file-path>')
    .example('$0 -s s4cred.base64 -f base64', 'Validates a base64 encoded speaks-for credential')
    .example('$0 -v -s s4cred.xml -f xml', 'Validates an xml encoded speaks-for credential with extra verbosity level')
    .options({
        's': {
            alias: 's4credential',
            required: true,
            nargs: 1,
            description: "Speaks-for credential file",
            group: 'Speaks-for Parameters'
        },
        'f': {
            alias: 'format',
            required: true,
            choices: ['base64', 'xml'],
            description: "Provided Speaks-for credential file format",
            group: 'Speaks-for Parameters'
        },
        'v': {
            alias: 'verbose',
            count: true,
            description: "Verbosity level (none, -v or -vv)"
        }
    })
    .help('h')
    .alias('h', 'help')
    .version(0.9)
    .epilog('Fed4FIRE - University of Cantabria - Copyright 2015')
    .strict()
    .wrap(yargs.terminalWidth())
    .argv;


var VERBOSE_LEVEL = argv.verbose;

function WARN() {
    VERBOSE_LEVEL >= 0 && console.log.apply(console, arguments);
}

function INFO() {
    VERBOSE_LEVEL >= 1 && console.log.apply(console, arguments);
}

function DEBUG() {
    VERBOSE_LEVEL >= 2 && console.log.apply(console, arguments);
}

try {
    INFO("## Loading Speaks-for credential...");
    var s4cred = loadSpeaksForCredential(argv.s4credential, argv.format === 'base64');
    INFO("## Speaks-for credential content: \n%s\n", s4cred);

    var doc = new dom().parseFromString(s4cred);
    var signature = xmlcrypto.xpath(doc, "/*/*/*[local-name(.)='Signature' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']")[0];
    utils.monkeyPatchSignedXmlExclusiveCanonicalization(xmlcrypto);
    var sig = new xmlcrypto.SignedXml(null, {
        idAttribute: "id"
    });
    sig.keyInfoProvider = new SpeaksForKeyInfo();
    sig.loadSignature(signature.toString());
    var res = sig.checkSignature(s4cred);
    if (res) {
        WARN("## Verification succeeded!!")
    } else {
        throw new Error(sig.validationErrors[0]);
    }
} catch (error) {
    WARN("## ERROR: %s", error);
    return;
}


function loadSpeaksForCredential(s4credential, isBase64) {
    var bitmap = fs.readFileSync(s4credential, 'utf8');
    var speaksForCredential = new Buffer(bitmap, isBase64 ? 'base64' : 'utf8').toString();
    return speaksForCredential;
}

function SpeaksForKeyInfo() {
    var certificate_header = "-----BEGIN CERTIFICATE-----";
    var certificate_footer = "-----END CERTIFICATE-----";

    this.wrapCertificate = function(cert) {
        return certificate_header + "\n" + _.trim(cert.replace(/\r\n/g, "\n"), ' \n') + "\n" + certificate_footer;
    }

    this.getKey = function(keyInfo) {
        var certificates = keyInfo[0].getElementsByTagName("X509Certificate");
        var pemChain = this.wrapCertificate(certificates[0].childNodes[0].nodeValue);
        for (var i = 1; i < certificates.length; i++) {
            pemChain += "\n" + this.wrapCertificate(certificates[i].childNodes[0].nodeValue);
        }
        return pemChain;
    }
}